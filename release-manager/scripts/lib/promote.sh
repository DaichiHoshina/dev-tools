#!/usr/bin/env bash
# Environment promotion library
# Reads tes tag and promotes to target environment (stg/prd)
# Requires: PROMOTE_TARGET_ENV to be set (stg or prd)

PROMOTE_TES_TAG=""
PROMOTE_TARGET_TAG=""
PROMOTE_BRANCH_NAME=""
PROMOTE_MR_IID=""
PROMOTE_MR_URL=""

promote::read_tes_tag() {
  log::step "Step 1: tes環境のイメージタグ取得"

  local tes_values_path="environments/tes/values/${SVC_VALUES_FILE}"

  log::info "tes values読み取り: ${tes_values_path}"

  local content
  content="$(gl::get_file "$INFRA_PROJECT_PATH" "$tes_values_path" "master")"

  if [[ -z "$content" ]]; then
    log::error "tes values.yaml の取得に失敗: ${tes_values_path}"
    return 1
  fi

  PROMOTE_TES_TAG="$(echo "$content" | grep -E '^\s*tag:' | head -1 | sed -E 's/.*tag:\s*["\x27]?([^"\x27[:space:]]+)["\x27]?.*/\1/')"

  if [[ -z "$PROMOTE_TES_TAG" ]]; then
    log::error "tes values.yaml から tag を抽出できません: ${tes_values_path}"
    return 1
  fi

  log::success "tesタグ取得: ${PROMOTE_TES_TAG}"
}

promote::check_diff() {
  log::step "Step 2: ${PROMOTE_TARGET_ENV}環境との差分確認"

  local target_values_path="environments/${PROMOTE_TARGET_ENV}/values/${SVC_VALUES_FILE}"

  log::info "${PROMOTE_TARGET_ENV} values読み取り: ${target_values_path}"

  local content
  content="$(gl::get_file "$INFRA_PROJECT_PATH" "$target_values_path" "master")"

  if [[ -z "$content" ]]; then
    log::error "${PROMOTE_TARGET_ENV} values.yaml の取得に失敗: ${target_values_path}"
    return 1
  fi

  PROMOTE_TARGET_TAG="$(echo "$content" | grep -E '^\s*tag:' | head -1 | sed -E 's/.*tag:\s*["\x27]?([^"\x27[:space:]]+)["\x27]?.*/\1/')"

  log::info "tes tag: ${PROMOTE_TES_TAG}"
  log::info "${PROMOTE_TARGET_ENV} tag: ${PROMOTE_TARGET_TAG}"

  if [[ "$PROMOTE_TES_TAG" == "$PROMOTE_TARGET_TAG" ]]; then
    log::success "tes と ${PROMOTE_TARGET_ENV} のタグが同一です（${PROMOTE_TES_TAG}）。昇格不要。"
    exit 0
  fi

  log::info "差分あり: ${PROMOTE_TARGET_TAG} → ${PROMOTE_TES_TAG}"
}

promote::create_branch() {
  log::step "Step 3: Helmブランチ作成"

  PROMOTE_BRANCH_NAME="promote-${PROMOTE_TARGET_ENV}/${SVC_CONFIG_KEY}/${PROMOTE_TES_TAG}"

  log::info "ブランチ作成中: ${PROMOTE_BRANCH_NAME}"

  local result
  if result="$(gl::create_branch "$INFRA_PROJECT_PATH" "$PROMOTE_BRANCH_NAME" "master" 2>&1)"; then
    log::success "ブランチ作成完了: ${PROMOTE_BRANCH_NAME}"
  else
    if echo "$result" | grep -q "already exists"; then
      log::info "ブランチ既存: ${PROMOTE_BRANCH_NAME}（スキップ）"
    else
      log::error "ブランチ作成失敗: ${result}"
      return 1
    fi
  fi
}

promote::update_values() {
  log::step "Step 4: ${PROMOTE_TARGET_ENV} values更新"

  local target_values_path="environments/${PROMOTE_TARGET_ENV}/values/${SVC_VALUES_FILE}"

  log::info "${PROMOTE_TARGET_ENV} values更新中: ${target_values_path} → tag: ${PROMOTE_TES_TAG}"

  local content
  content="$(gl::get_file "$INFRA_PROJECT_PATH" "$target_values_path" "$PROMOTE_BRANCH_NAME")"

  if [[ -z "$content" ]]; then
    log::error "${PROMOTE_TARGET_ENV} values.yaml の取得に失敗: ${target_values_path}"
    return 1
  fi

  if echo "$content" | grep -q "tag:.*${PROMOTE_TES_TAG}"; then
    log::info "${PROMOTE_TARGET_ENV} values.yaml は既に更新済みです (tag: ${PROMOTE_TES_TAG})"
    return 0
  fi

  local updated
  updated="$(echo "$content" | sed -E "s/(tag:[[:space:]]*[\"']?)[^\"'[:space:]]+([\"\']?)/\1${PROMOTE_TES_TAG}\2/")"

  if [[ "$updated" == "$content" ]]; then
    log::error "${PROMOTE_TARGET_ENV} values.yaml の tag 形式が見つかりません: ${target_values_path}"
    return 1
  fi

  gl::update_file \
    "$INFRA_PROJECT_PATH" \
    "$target_values_path" \
    "$PROMOTE_BRANCH_NAME" \
    "$updated" \
    "chore: promote ${SVC_CONFIG_KEY} to ${PROMOTE_TARGET_ENV} (${PROMOTE_TES_TAG})" > /dev/null

  log::success "${PROMOTE_TARGET_ENV} values更新完了: ${PROMOTE_TES_TAG}"
}

promote::create_mr() {
  log::step "Step 5: Helm MR作成"

  # Check for existing MR
  local existing
  existing="$(gl::find_mrs "$INFRA_PROJECT_PATH" "$PROMOTE_BRANCH_NAME" "master" "all")"

  local merged_mr
  merged_mr="$(echo "$existing" | jq -r '[.[] | select(.state == "merged")] | first // empty')"
  if [[ -n "$merged_mr" && "$merged_mr" != "null" ]]; then
    PROMOTE_MR_IID="$(echo "$merged_mr" | jq -r '.iid')"
    PROMOTE_MR_URL="$(echo "$merged_mr" | jq -r '.web_url')"
    log::success "MRは既にマージ済み: !${PROMOTE_MR_IID} ${PROMOTE_MR_URL}"
    return 0
  fi

  local open_mr
  open_mr="$(echo "$existing" | jq -r '[.[] | select(.state == "opened")] | first // empty')"
  if [[ -n "$open_mr" && "$open_mr" != "null" ]]; then
    PROMOTE_MR_IID="$(echo "$open_mr" | jq -r '.iid')"
    PROMOTE_MR_URL="$(echo "$open_mr" | jq -r '.web_url')"
    log::info "既存のオープンMRを再利用: !${PROMOTE_MR_IID} ${PROMOTE_MR_URL}"
    return 0
  fi

  # Derive ArgoCD app for target env from tes argocd_app
  local argocd_app
  argocd_app="$(echo "$SVC_ARGOCD_APP" | sed "s/-tes-/-${PROMOTE_TARGET_ENV}-/")"

  local env_upper
  env_upper="$(echo "$PROMOTE_TARGET_ENV" | tr '[:lower:]' '[:upper:]')"

  local description
  description="$(printf '## %sデプロイ\n- サービス: %s\n- バージョン: %s\n- 昇格元: tes (%s → %s)\n- values_file: %s\n- argocd_app: %s\n\ntes→%s昇格MRです。レビュー後にマージしてください。' \
    "$env_upper" "$SVC_CONFIG_KEY" "$PROMOTE_TES_TAG" "$PROMOTE_TARGET_TAG" "$PROMOTE_TES_TAG" "$SVC_VALUES_FILE" "$argocd_app" "$PROMOTE_TARGET_ENV")"

  log::info "MR作成中: ${PROMOTE_BRANCH_NAME} → master"

  local result
  result="$(gl::create_mr \
    "$INFRA_PROJECT_PATH" \
    "$PROMOTE_BRANCH_NAME" \
    "master" \
    "Deploy ${SVC_CONFIG_KEY} ${PROMOTE_TES_TAG}" \
    "$description")"

  PROMOTE_MR_IID="$(echo "$result" | jq -r '.iid')"
  PROMOTE_MR_URL="$(echo "$result" | jq -r '.web_url')"
  log::success "MR作成完了: !${PROMOTE_MR_IID} ${PROMOTE_MR_URL}"
}
