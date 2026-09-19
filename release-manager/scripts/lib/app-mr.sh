#!/usr/bin/env bash
# App MR creation and merge handling
# Idempotent: reuses existing MRs

APP_MR_IID=""
APP_MR_URL=""
APP_MERGE_COMMIT_SHA=""

app_mr::create_or_find() {
  log::step "Step 1: App MR作成 (main → release)"

  if [[ "${SKIP_APP_MR:-}" == "true" ]]; then
    log::info "SKIP_APP_MR=true: App MRステップをスキップします"
    return 0
  fi

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] App MR作成をスキップ: ${APP_PROJECT_PATH} main → release"
    APP_MR_IID="0"
    APP_MR_URL="(dry-run)"
    return 0
  fi

  # Check for existing MR
  local existing
  existing="$(gl::find_mrs "$APP_PROJECT_PATH" "main" "release" "all")"

  local merged_mr
  merged_mr="$(echo "$existing" | jq -r '[.[] | select(.title | contains("'"${TAG_NAME}"'")) | select(.state == "merged")] | first // empty')"
  if [[ -n "$merged_mr" && "$merged_mr" != "null" ]]; then
    APP_MR_IID="$(echo "$merged_mr" | jq -r '.iid')"
    APP_MR_URL="$(echo "$merged_mr" | jq -r '.web_url')"
    APP_MERGE_COMMIT_SHA="$(echo "$merged_mr" | jq -r '.merge_commit_sha // empty')"
    log::success "既存のマージ済みMRを検出: !${APP_MR_IID} ${APP_MR_URL}"
    return 0
  fi

  local open_mr
  open_mr="$(echo "$existing" | jq -r '[.[] | select(.state == "opened")] | first // empty')"
  if [[ -n "$open_mr" && "$open_mr" != "null" ]]; then
    APP_MR_IID="$(echo "$open_mr" | jq -r '.iid')"
    APP_MR_URL="$(echo "$open_mr" | jq -r '.web_url')"
    log::info "既存のオープンMRを再利用: !${APP_MR_IID} ${APP_MR_URL}"
    return 0
  fi

  # Create new MR
  log::info "App MR作成中: ${APP_PROJECT_PATH} main → release"
  local result
  result="$(gl::create_mr \
    "$APP_PROJECT_PATH" \
    "main" \
    "release" \
    "Release ${TAG_NAME} - ${SVC_CONFIG_KEY}" \
    "## デプロイ\n- サービス: ${SVC_CONFIG_KEY}\n- バージョン: ${TAG_NAME}\n\n自動生成されたMRです。")"

  APP_MR_IID="$(echo "$result" | jq -r '.iid')"
  APP_MR_URL="$(echo "$result" | jq -r '.web_url')"
  log::success "App MR作成完了: !${APP_MR_IID} ${APP_MR_URL}"
}

app_mr::approve_and_merge() {
  log::step "Step 2: App MR承認・マージ"

  if [[ "${SKIP_APP_MR:-}" == "true" ]]; then
    log::info "SKIP_APP_MR=true: スキップ"
    return 0
  fi

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] App MR承認・マージをスキップ"
    return 0
  fi

  # Check if already merged
  local mr_state
  mr_state="$(gl::get_mr "$APP_PROJECT_PATH" "$APP_MR_IID" | jq -r '.state')"
  if [[ "$mr_state" == "merged" ]]; then
    log::success "App MRは既にマージ済みです"
    return 0
  fi

  # Approve
  log::info "App MRを承認中..."
  gl::approve_mr "$APP_PROJECT_PATH" "$APP_MR_IID" > /dev/null 2>&1 || {
    log::warning "承認失敗（既に承認済みの可能性あり）、続行します"
  }

  sleep 2

  # Merge with MWPS
  local retries=3
  while (( retries > 0 )); do
    local mr_data
    mr_data="$(gl::get_mr "$APP_PROJECT_PATH" "$APP_MR_IID")"
    local state merge_status has_conflicts
    state="$(echo "$mr_data" | jq -r '.state')"
    merge_status="$(echo "$mr_data" | jq -r '.merge_status // empty')"
    has_conflicts="$(echo "$mr_data" | jq -r '.has_conflicts')"

    log::info "MR状態: state=${state}, merge_status=${merge_status}, has_conflicts=${has_conflicts}"

    if [[ "$state" == "merged" ]]; then
      APP_MERGE_COMMIT_SHA="$(echo "$mr_data" | jq -r '.merge_commit_sha // empty')"
      log::success "App MRがマージされました"
      return 0
    fi

    if [[ "$has_conflicts" == "true" ]]; then
      log::error "ブランチにコンフリクトがあります"
      return 1
    fi

    if [[ -n "$merge_status" && "$merge_status" != "can_be_merged" ]]; then
      if (( retries > 1 )); then
        log::warning "マージ不可: ${merge_status}。5秒待機してリトライ (残り$((retries - 1))回)"
        sleep 5
        retries=$((retries - 1))
        continue
      fi
    fi

    # Issue merge (MWPS → 失敗なら即マージにフォールバック)
    local merge_err
    if merge_err="$(gl::merge_mr "$APP_PROJECT_PATH" "$APP_MR_IID" "false" "true" 2>&1)"; then
      log::info "マージ予約完了。マージ完了を待機中..."
      break
    else
      log::warning "MWPS マージ失敗: ${merge_err}"
      # 405/406 = パイプライン未起動。即マージを試行
      if echo "$merge_err" | grep -qE "405|406|Method Not Allowed"; then
        log::info "パイプライン未起動のため即マージを試行..."
        if gl::merge_mr "$APP_PROJECT_PATH" "$APP_MR_IID" "false" "false" > /dev/null 2>&1; then
          log::info "即マージ予約完了。マージ完了を待機中..."
          break
        fi
      fi
      if (( retries > 1 )); then
        log::warning "5秒待機してリトライ (残り$((retries - 1))回)"
        sleep 5
        retries=$((retries - 1))
        continue
      else
        log::error "App MRのマージに失敗しました: ${merge_err}"
        return 1
      fi
    fi
  done

  # Poll for merge completion
  local start_time
  start_time="$(date +%s)"
  local max_wait=1800  # 30 min
  local interval=15

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "App MRマージ待機タイムアウト（30分）"
      return 1
    fi

    sleep "$interval"

    local mr_data
    mr_data="$(gl::get_mr "$APP_PROJECT_PATH" "$APP_MR_IID")"
    local state
    state="$(echo "$mr_data" | jq -r '.state')"

    if [[ "$state" == "merged" ]]; then
      APP_MERGE_COMMIT_SHA="$(echo "$mr_data" | jq -r '.merge_commit_sha // empty')"
      log::success "App MRがマージされました（${elapsed}秒）"
      return 0
    fi

    if [[ "$state" == "closed" ]]; then
      log::error "App MRがクローズされました"
      return 1
    fi

    log::info "マージ待機中... (state=${state}, ${elapsed}秒経過)"
  done
}

app_mr::wait_release_pipeline() {
  log::step "Step 3: releaseパイプライン完了待ち"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] releaseパイプライン待ちをスキップ"
    return 0
  fi

  sleep 3  # Wait for pipeline to be created

  local pipelines
  pipelines="$(gl::get_pipelines "$APP_PROJECT_PATH" "release" 1)"
  local pipeline_count
  pipeline_count="$(echo "$pipelines" | jq 'length')"

  if (( pipeline_count == 0 )); then
    log::info "releaseパイプラインが見つかりません。スキップします"
    return 0
  fi

  local pipeline_id pipeline_status pipeline_url
  pipeline_id="$(echo "$pipelines" | jq -r '.[0].id')"
  pipeline_status="$(echo "$pipelines" | jq -r '.[0].status')"
  pipeline_url="$(echo "$pipelines" | jq -r '.[0].web_url')"

  log::info "releaseパイプライン検出: ${pipeline_url} (status=${pipeline_status})"

  if [[ "$pipeline_status" == "success" ]]; then
    log::success "releaseパイプラインは既に成功しています"
    return 0
  fi

  if [[ "$pipeline_status" == "failed" || "$pipeline_status" == "canceled" ]]; then
    log::error "releaseパイプライン失敗: ${pipeline_status} (${pipeline_url})"
    return 1
  fi

  # Poll until complete
  local start_time
  start_time="$(date +%s)"
  local max_wait=1800
  local interval=15

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "releaseパイプラインタイムアウト（30分）"
      return 1
    fi

    sleep "$interval"

    local status_data
    status_data="$(gl::get_pipeline_status "$APP_PROJECT_PATH" "$pipeline_id")"
    pipeline_status="$(echo "$status_data" | jq -r '.status')"

    if [[ "$pipeline_status" == "success" ]]; then
      log::success "releaseパイプライン完了（${elapsed}秒）"
      return 0
    fi

    if [[ "$pipeline_status" == "failed" || "$pipeline_status" == "canceled" ]]; then
      log::error "releaseパイプライン失敗: ${pipeline_status}"
      return 1
    fi

    log::info "releaseパイプライン待機中... (status=${pipeline_status}, ${elapsed}秒経過)"
  done
}
