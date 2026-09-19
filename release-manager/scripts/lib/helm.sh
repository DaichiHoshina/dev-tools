#!/usr/bin/env bash
# Helm MR creation and merge handling
# Idempotent: reuses existing branches/MRs

HELM_MR_IID=""
HELM_MR_URL=""
HELM_BRANCH_NAME=""
HELM_PIPELINE_ID=""
HELM_PIPELINE_URL=""
HELM_CHANGES_SECTION=""

helm::create_branch() {
  log::step "Step 6: Helm ブランチ作成 & values更新"

  HELM_BRANCH_NAME="deploy/${SVC_CONFIG_KEY}/${TAG_NAME}"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] Helmブランチ作成をスキップ: ${HELM_BRANCH_NAME}"
    return 0
  fi

  log::info "Helmブランチ作成中: ${HELM_BRANCH_NAME}"

  local result
  if result="$(gl::create_branch "$INFRA_PROJECT_PATH" "$HELM_BRANCH_NAME" "master" 2>&1)"; then
    log::success "Helmブランチ作成完了: ${HELM_BRANCH_NAME}"
  else
    if echo "$result" | grep -q "already exists"; then
      log::info "Helmブランチ既存: ${HELM_BRANCH_NAME}（スキップ）"
    else
      log::error "Helmブランチ作成失敗: ${result}"
      return 1
    fi
  fi
}

helm::update_values() {
  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] values.yaml更新をスキップ"
    return 0
  fi

  local values_path="environments/tes/values/${SVC_VALUES_FILE}"
  local helm_tag="prd-${TAG_NAME}"

  log::info "values.yaml更新中: ${values_path} → tag: ${helm_tag}"

  # Get current file content
  local content
  content="$(gl::get_file "$INFRA_PROJECT_PATH" "$values_path" "$HELM_BRANCH_NAME")"

  if [[ -z "$content" ]]; then
    log::error "values.yaml の取得に失敗: ${values_path}"
    return 1
  fi

  # Check if already updated
  if echo "$content" | grep -q "tag:.*${helm_tag}"; then
    log::info "values.yaml は既に更新済みです (tag: ${helm_tag})"
    return 0
  fi

  # Replace tag value
  # Pattern 1: image:\n  ...\n  tag: "prd-vX.Y.Z"
  # Pattern 2: tag: "prd-vX.Y.Z" directly
  local updated
  updated="$(echo "$content" | sed -E "s/(tag:[[:space:]]*[\"']?)prd-[^\"'[:space:]]+([\"']?)/\1${helm_tag}\2/")"

  if [[ "$updated" == "$content" ]]; then
    # Fallback: try without prd- prefix
    updated="$(echo "$content" | sed -E "s/(tag:[[:space:]]*[\"']?)[^\"'[:space:]]+([\"']?)/\1${helm_tag}\2/")"
  fi

  if [[ "$updated" == "$content" ]]; then
    log::error "values.yaml の tag 形式が見つかりません: ${values_path}"
    return 1
  fi

  gl::update_file \
    "$INFRA_PROJECT_PATH" \
    "$values_path" \
    "$HELM_BRANCH_NAME" \
    "$updated" \
    "chore: update ${SVC_CONFIG_KEY} to ${helm_tag}" > /dev/null

  log::success "values.yaml更新完了: ${helm_tag}"
}

helm::collect_changes() {
  if [[ "${DRY_RUN:-}" == "true" ]]; then
    return 0
  fi

  log::info "関連MR一覧を取得中..."

  # Compare release vs main to get commits being deployed
  local compare_json
  compare_json="$(gl::compare "$APP_PROJECT_PATH" "release" "main" 2>/dev/null)" || {
    log::warning "ブランチ比較失敗。変更一覧をスキップします"
    return 0
  }

  local commit_count
  commit_count="$(echo "$compare_json" | jq '.commits | length')"

  if (( commit_count == 0 )); then
    log::info "差分コミットなし"
    return 0
  fi

  log::info "差分コミット: ${commit_count}件"

  # Collect unique MRs merged to main from each commit
  local mr_lines=""
  local seen_iids=""

  local commit_shas
  commit_shas="$(echo "$compare_json" | jq -r '.commits[].id')"

  while IFS= read -r sha; do
    [[ -z "$sha" ]] && continue

    local mrs_json
    mrs_json="$(gl::get_commit_mrs "$APP_PROJECT_PATH" "$sha" 2>/dev/null)" || continue

    local entries
    entries="$(echo "$mrs_json" | jq -r '.[] | select(.target_branch == "main" and .state == "merged") | "\(.iid)\t\(.title)\t\(.web_url)"')"

    while IFS=$'\t' read -r iid title web_url; do
      [[ -z "$iid" ]] && continue
      # Deduplicate
      if echo "$seen_iids" | grep -qw "$iid"; then
        continue
      fi
      seen_iids="$seen_iids $iid"
      mr_lines="${mr_lines}- ${title} ([!${iid}](${web_url}))"$'\n'
    done <<< "$entries"
  done <<< "$commit_shas"

  if [[ -n "$mr_lines" ]]; then
    HELM_CHANGES_SECTION=$'\n### 含まれる変更\n'"${mr_lines}"
    local count
    count="$(echo "$seen_iids" | wc -w | tr -d ' ')"
    log::success "関連MR: ${count}件"
  else
    log::info "関連MRなし"
  fi
}

helm::create_mr_or_find() {
  log::step "Step 7: Helm MR作成・マージ"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] Helm MR作成をスキップ"
    HELM_MR_IID="0"
    HELM_MR_URL="(dry-run)"
    return 0
  fi

  # Check for existing MR
  local existing
  existing="$(gl::find_mrs "$INFRA_PROJECT_PATH" "$HELM_BRANCH_NAME" "master" "all")"

  local merged_mr
  merged_mr="$(echo "$existing" | jq -r '[.[] | select(.state == "merged")] | first // empty')"
  if [[ -n "$merged_mr" && "$merged_mr" != "null" ]]; then
    HELM_MR_IID="$(echo "$merged_mr" | jq -r '.iid')"
    HELM_MR_URL="$(echo "$merged_mr" | jq -r '.web_url')"
    log::success "Helm MRは既にマージ済み: !${HELM_MR_IID} ${HELM_MR_URL}"
    return 0
  fi

  local open_mr
  open_mr="$(echo "$existing" | jq -r '[.[] | select(.state == "opened")] | first // empty')"
  if [[ -n "$open_mr" && "$open_mr" != "null" ]]; then
    HELM_MR_IID="$(echo "$open_mr" | jq -r '.iid')"
    HELM_MR_URL="$(echo "$open_mr" | jq -r '.web_url')"
    log::info "既存のオープンHelm MRを再利用: !${HELM_MR_IID} ${HELM_MR_URL}"
    return 0
  fi

  # Create new MR
  log::info "Helm MR作成中: ${HELM_BRANCH_NAME} → master"
  local description
  description="$(printf '## Helmデプロイ\n- サービス: %s\n- バージョン: %s\n- values_file: %s\n- argocd_app: %s\n%s\n自動生成されたMRです。' \
    "$SVC_CONFIG_KEY" "$TAG_NAME" "$SVC_VALUES_FILE" "$SVC_ARGOCD_APP" "$HELM_CHANGES_SECTION")"

  local result
  result="$(gl::create_mr \
    "$INFRA_PROJECT_PATH" \
    "$HELM_BRANCH_NAME" \
    "master" \
    "Deploy ${SVC_CONFIG_KEY} ${TAG_NAME}" \
    "$description")"

  HELM_MR_IID="$(echo "$result" | jq -r '.iid')"
  HELM_MR_URL="$(echo "$result" | jq -r '.web_url')"
  log::success "Helm MR作成完了: !${HELM_MR_IID} ${HELM_MR_URL}"
}

helm::approve_and_merge() {
  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] Helm MR承認・マージをスキップ"
    return 0
  fi

  # Check if already merged
  local mr_state
  mr_state="$(gl::get_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID" | jq -r '.state')"
  if [[ "$mr_state" == "merged" ]]; then
    log::success "Helm MRは既にマージ済みです"
    return 0
  fi

  # Approve
  log::info "Helm MRを承認中..."
  gl::approve_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID" > /dev/null 2>&1 || {
    log::warning "Helm MR承認失敗（既に承認済みの可能性あり）、続行します"
  }

  sleep 2

  # Wait for merge_status = can_be_merged
  local retries=3
  while (( retries > 0 )); do
    local mr_data
    mr_data="$(gl::get_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID")"
    local state merge_status has_conflicts
    state="$(echo "$mr_data" | jq -r '.state')"
    merge_status="$(echo "$mr_data" | jq -r '.merge_status // empty')"
    has_conflicts="$(echo "$mr_data" | jq -r '.has_conflicts')"

    log::info "Helm MR状態: state=${state}, merge_status=${merge_status}, has_conflicts=${has_conflicts}"

    if [[ "$state" == "merged" ]]; then
      log::success "Helm MRがマージされました"
      return 0
    fi

    if [[ "$has_conflicts" == "true" ]]; then
      log::error "Helm MRにコンフリクトがあります"
      return 1
    fi

    if [[ -n "$merge_status" && "$merge_status" != "can_be_merged" ]]; then
      if (( retries > 1 )); then
        log::warning "Helm MRがマージ不可: ${merge_status}。5秒待機 (残り$((retries - 1))回)"
        sleep 5
        retries=$((retries - 1))
        continue
      fi
    fi
    break
  done

  # Issue merge (MWPS → 失敗なら即マージにフォールバック)
  local merge_err
  if merge_err="$(gl::merge_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID" "true" "true" 2>&1)"; then
    log::info "Helm MRマージ予約完了"
  else
    log::warning "MWPS マージ失敗: ${merge_err}"
    if gl::merge_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID" "true" "false" > /dev/null 2>&1; then
      log::info "即マージで予約完了"
    else
      log::warning "マージ予約失敗。ポーリングでマージ完了を確認します"
    fi
  fi

  # Poll for merge completion
  local start_time
  start_time="$(date +%s)"
  local max_wait=1800
  local interval=15

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "Helm MRマージ待機タイムアウト（30分）"
      return 1
    fi

    sleep "$interval"

    local mr_data
    mr_data="$(gl::get_mr "$INFRA_PROJECT_PATH" "$HELM_MR_IID")"
    local state
    state="$(echo "$mr_data" | jq -r '.state')"

    if [[ "$state" == "merged" ]]; then
      log::success "Helm MRがマージされました（${elapsed}秒）"
      return 0
    fi

    if [[ "$state" == "closed" ]]; then
      log::error "Helm MRがクローズされました"
      return 1
    fi

    log::info "Helm MRマージ待機中... (state=${state}, ${elapsed}秒経過)"
  done
}

helm::wait_pipeline() {
  log::step "Step 8: Helmパイプライン完了待ち"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] Helmパイプライン待ちをスキップ"
    return 0
  fi

  # Detection phase: wait for pipeline to appear on master after merge
  local detection_interval=5
  local detection_max_wait=300  # 5 min
  local start_time
  start_time="$(date +%s)"

  log::info "Helmリポジトリ master のパイプラインを検出中..."

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= detection_max_wait )); then
      log::error "Helmパイプライン検出タイムアウト（5分）"
      return 1
    fi

    local pipelines
    pipelines="$(gl::get_pipelines "$INFRA_PROJECT_PATH" "master" 1)"
    local count
    count="$(echo "$pipelines" | jq 'length')"

    if (( count > 0 )); then
      HELM_PIPELINE_ID="$(echo "$pipelines" | jq -r '.[0].id')"
      HELM_PIPELINE_URL="$(echo "$pipelines" | jq -r '.[0].web_url')"
      local status
      status="$(echo "$pipelines" | jq -r '.[0].status')"

      log::success "Helmパイプライン検出: ${HELM_PIPELINE_URL} (${elapsed}秒)"

      if [[ "$status" == "success" ]]; then
        log::success "Helmパイプラインは既に成功しています"
        return 0
      fi

      if [[ "$status" == "failed" || "$status" == "canceled" ]]; then
        log::error "Helmパイプライン失敗: ${status} (${HELM_PIPELINE_URL})"
        return 1
      fi

      # Move to wait phase
      break
    fi

    log::info "Helmパイプライン未検出、リトライ中... (${elapsed}秒経過)"
    sleep "$detection_interval"
  done

  # Wait phase: poll until pipeline completes
  local max_wait=1800  # 30 min
  local interval=15

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "Helmパイプラインタイムアウト（30分）"
      return 1
    fi

    sleep "$interval"

    local status_data
    status_data="$(gl::get_pipeline_status "$INFRA_PROJECT_PATH" "$HELM_PIPELINE_ID")"
    local status
    status="$(echo "$status_data" | jq -r '.status')"

    if [[ "$status" == "success" ]]; then
      log::success "Helmパイプライン完了（${elapsed}秒）"
      return 0
    fi

    if [[ "$status" == "failed" || "$status" == "canceled" ]]; then
      log::error "Helmパイプライン失敗: ${status} (${HELM_PIPELINE_URL})"
      return 1
    fi

    log::info "Helmパイプライン待機中... (status=${status}, ${elapsed}秒経過)"
  done
}
