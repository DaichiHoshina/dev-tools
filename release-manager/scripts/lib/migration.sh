#!/usr/bin/env bash
# Migration change detection and Slack notification
# Detects assets/migrations/ changes in App MR and notifies Slack

MIGRATION_DIR_PATTERN="assets/migrations/"

migration::check_and_notify() {
  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] マイグレーション検出をスキップ"
    return 0
  fi

  if [[ "${SKIP_APP_MR:-}" == "true" ]]; then
    log::info "SKIP_APP_MR=true: マイグレーション検出をスキップ"
    return 0
  fi

  if [[ -z "${APP_MR_IID:-}" || "${APP_MR_IID}" == "0" ]]; then
    log::info "App MR IIDがないため、マイグレーション検出をスキップ"
    return 0
  fi

  log::info "マイグレーション変更を検出中... (project=${APP_PROJECT_PATH}, MR=!${APP_MR_IID})"

  local changes_json api_error
  if ! changes_json="$(gl::get_mr_changes "$APP_PROJECT_PATH" "$APP_MR_IID" 2>&1)"; then
    api_error="$changes_json"
    log::warning "MR変更ファイル取得失敗: ${api_error}"
    log::warning "マイグレーション検出をスキップします"
    return 0
  fi

  # changesの件数をログ出力
  local total_changes
  total_changes="$(echo "$changes_json" | jq '.changes | length' 2>/dev/null || echo "0")"
  log::info "MR変更ファイル数: ${total_changes}件"

  if [[ "$total_changes" == "0" ]]; then
    log::info "MRに変更ファイルがありません"
    return 0
  fi

  # 全ファイルパスをデバッグ出力（migration関連の調査用）
  local all_paths
  all_paths="$(echo "$changes_json" | jq -r '.changes[].new_path // empty' 2>/dev/null)"
  local migration_candidate_count
  migration_candidate_count="$(echo "$all_paths" | grep -c "migration" || true)"
  if (( migration_candidate_count > 0 )); then
    log::info "migration関連パス候補: ${migration_candidate_count}件"
  fi

  # Filter for migration files
  local migration_files
  migration_files="$(echo "$all_paths" | grep "^${MIGRATION_DIR_PATTERN}" || true)"

  if [[ -z "$migration_files" ]]; then
    log::info "マイグレーション変更なし (パターン: ${MIGRATION_DIR_PATTERN})"
    return 0
  fi

  local file_count
  file_count="$(echo "$migration_files" | wc -l | tr -d ' ')"
  log::warning "マイグレーション変更検出: ${file_count}ファイル"

  # Build file list for notification
  local file_list=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    file_list="${file_list}• ${f}\n"
  done <<< "$migration_files"

  # Send Slack notification
  migration::_notify_slack "$file_count" "$file_list" "tes" "$TAG_NAME" "${APP_MR_URL:-}"
}

migration::check_promote() {
  local target_tag="${PROMOTE_TARGET_TAG:-}"
  local tes_tag="${PROMOTE_TES_TAG:-}"

  if [[ -z "$target_tag" || -z "$tes_tag" || "$target_tag" == "$tes_tag" ]]; then
    return 0
  fi

  log::info "マイグレーション変更を検出中（${target_tag} → ${tes_tag}）..."

  local compare_json api_error
  if ! compare_json="$(gl::compare "$APP_PROJECT_PATH" "$target_tag" "$tes_tag" 2>&1)"; then
    api_error="$compare_json"
    log::warning "タグ比較失敗: ${api_error}"
    log::warning "マイグレーション検出をスキップします"
    return 0
  fi

  local total_diffs
  total_diffs="$(echo "$compare_json" | jq '.diffs | length' 2>/dev/null || echo "0")"
  log::info "タグ間差分ファイル数: ${total_diffs}件"

  local migration_files
  migration_files="$(echo "$compare_json" | jq -r '.diffs[].new_path // empty' | grep "^${MIGRATION_DIR_PATTERN}" || true)"

  if [[ -z "$migration_files" ]]; then
    log::info "マイグレーション変更なし (パターン: ${MIGRATION_DIR_PATTERN})"
    return 0
  fi

  local file_count
  file_count="$(echo "$migration_files" | wc -l | tr -d ' ')"
  log::warning "マイグレーション変更検出: ${file_count}ファイル"

  local file_list=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    file_list="${file_list}• ${f}\n"
  done <<< "$migration_files"

  migration::_notify_slack "$file_count" "$file_list" "${PROMOTE_TARGET_ENV:-prd}" "${tes_tag}" ""
}

migration::_notify_slack() {
  local file_count="$1"
  local file_list="$2"
  local env="${3:-tes}"
  local version="${4:-$TAG_NAME}"
  local mr_url="${5:-${APP_MR_URL:-}}"

  local webhook_url
  if [[ "$env" == "prd" ]]; then
    webhook_url="${SLACK_WEBHOOK_URL_PRD:-${SLACK_WEBHOOK_URL:-}}"
  else
    webhook_url="${SLACK_WEBHOOK_URL_TES:-${SLACK_WEBHOOK_URL:-}}"
  fi

  if [[ -z "$webhook_url" ]]; then
    log::warning "SLACK_WEBHOOK_URL未設定。マイグレーション通知をスキップ"
    return 0
  fi

  local env_upper
  env_upper="$(echo "$env" | tr '[:lower:]' '[:upper:]')"

  local mr_block=""
  if [[ -n "$mr_url" ]]; then
    mr_block="$(jq -n --arg url "$mr_url" '[{"type": "section", "text": {"type": "mrkdwn", "text": ("*App MR:* <" + $url + "|MR確認>")}}]')"
  else
    mr_block="[]"
  fi

  local payload
  payload="$(jq -n \
    --arg service "$SVC_CONFIG_KEY" \
    --arg version "$version" \
    --arg count "$file_count" \
    --arg files "$file_list" \
    --arg env "$env_upper" \
    --argjson mr_block "$mr_block" \
    '{
      blocks: ([
        {
          type: "header",
          text: {
            type: "plain_text",
            text: ("⚠️ [" + $env + "] マイグレーション変更検出 - " + $service)
          }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: ("*サービス:*\n" + $service) },
            { type: "mrkdwn", text: ("*バージョン:*\n" + $version) }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ("*変更ファイル (" + $count + "件):*\n" + $files)
          }
        }
      ] + $mr_block)
    }')"

  local response http_code
  response="$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$payload" "$webhook_url" 2>&1)"
  http_code="$(echo "$response" | tail -n1)"
  response="$(echo "$response" | sed '$d')"

  if [[ "$http_code" =~ ^2 ]]; then
    log::success "マイグレーション通知をSlackに送信しました（${env_upper}）"
  else
    log::warning "Slack通知送信失敗 (HTTP ${http_code}): ${response}"
    log::warning "処理は続行します"
  fi
}
