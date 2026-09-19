#!/usr/bin/env bash
# Tag creation and pipeline wait
# Idempotent: skips if tag already exists

TAG_PIPELINE_ID=""
TAG_PIPELINE_URL=""

tag::create_or_skip() {
  log::step "Step 4: タグ作成"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] タグ作成をスキップ: ${TAG_NAME}"
    return 0
  fi

  # Check if tag already exists
  if gl::get_tag "$APP_PROJECT_PATH" "$TAG_NAME" > /dev/null 2>&1; then
    log::success "タグ既存: ${TAG_NAME}（スキップ）"
    return 0
  fi

  log::info "タグ作成中: ${TAG_NAME} (ref=release)"
  gl::create_tag "$APP_PROJECT_PATH" "$TAG_NAME" "release" "Release ${TAG_NAME}" > /dev/null
  log::success "タグ作成完了: ${TAG_NAME}"
}

tag::wait_pipeline() {
  log::step "Step 5: タグパイプライン完了待ち"

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log::info "[DRY_RUN] タグパイプライン待ちをスキップ"
    return 0
  fi

  # Detection phase: wait for pipeline to appear
  local detection_interval=3
  local detection_max_wait=300  # 5 min
  local start_time
  start_time="$(date +%s)"

  log::info "タグ ${TAG_NAME} のパイプラインを検出中..."

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= detection_max_wait )); then
      log::error "パイプライン検出タイムアウト（5分）: タグ ${TAG_NAME}"
      return 1
    fi

    local pipelines
    pipelines="$(gl::get_pipelines "$APP_PROJECT_PATH" "$TAG_NAME" 1)"
    local count
    count="$(echo "$pipelines" | jq 'length')"

    if (( count > 0 )); then
      TAG_PIPELINE_ID="$(echo "$pipelines" | jq -r '.[0].id')"
      TAG_PIPELINE_URL="$(echo "$pipelines" | jq -r '.[0].web_url')"
      local status
      status="$(echo "$pipelines" | jq -r '.[0].status')"

      log::success "パイプライン検出: ${TAG_PIPELINE_URL} (${elapsed}秒)"

      if [[ "$status" == "success" ]]; then
        log::success "タグパイプラインは既に成功しています"
        return 0
      fi

      if [[ "$status" == "failed" || "$status" == "canceled" ]]; then
        log::error "タグパイプライン失敗: ${status} (${TAG_PIPELINE_URL})"
        return 1
      fi

      # Move to wait phase
      break
    fi

    log::info "パイプライン未検出、リトライ中... (${elapsed}秒経過)"
    sleep "$detection_interval"
  done

  # Wait phase: poll until pipeline completes
  local max_wait=1800  # 30 min
  local interval=15

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "タグパイプラインタイムアウト（30分）"
      return 1
    fi

    sleep "$interval"

    local status_data
    status_data="$(gl::get_pipeline_status "$APP_PROJECT_PATH" "$TAG_PIPELINE_ID")"
    local status
    status="$(echo "$status_data" | jq -r '.status')"

    if [[ "$status" == "success" ]]; then
      log::success "タグパイプライン完了（${elapsed}秒）"
      return 0
    fi

    if [[ "$status" == "failed" || "$status" == "canceled" ]]; then
      log::error "タグパイプライン失敗: ${status} (${TAG_PIPELINE_URL})"
      return 1
    fi

    log::info "タグパイプライン待機中... (status=${status}, ${elapsed}秒経過)"
  done
}
