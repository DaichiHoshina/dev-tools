#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load libraries
source "${SCRIPT_DIR}/lib/gitlab-api.sh"
source "${SCRIPT_DIR}/lib/config.sh"
source "${SCRIPT_DIR}/lib/promote.sh"
source "${SCRIPT_DIR}/lib/migration.sh"

# ==============================================
# Promote TES → target environment (stg/prd)
# ==============================================

: "${PROMOTE_TARGET_ENV:?PROMOTE_TARGET_ENV is not set (stg or prd)}"

main() {
  local env_upper
  env_upper="$(echo "$PROMOTE_TARGET_ENV" | tr '[:lower:]' '[:upper:]')"

  echo "=============================================="
  echo " Promote TES → ${env_upper}"
  echo " SERVICE: ${SERVICE_NAME:-未設定}"
  echo " TARGET:  ${PROMOTE_TARGET_ENV}"
  echo " $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================="
  echo ""

  # --- Validate & Load Config ---
  config::validate_promote
  config::resolve_service
  config::load_service

  echo ""
  log::info "${PROMOTE_TARGET_ENV}昇格開始: ${SVC_CONFIG_KEY}"
  echo ""

  # --- Promote ---
  promote::read_tes_tag
  promote::check_diff

  # --- Migration check ---
  migration::check_promote

  promote::create_branch
  promote::update_values
  promote::create_mr

  # --- Summary ---
  local argocd_app
  argocd_app="$(echo "$SVC_ARGOCD_APP" | sed "s/-tes-/-${PROMOTE_TARGET_ENV}-/")"

  echo ""
  echo "=============================================="
  echo " ${PROMOTE_TARGET_ENV}昇格完了"
  echo "=============================================="
  echo " サービス:   ${SVC_CONFIG_KEY}"
  echo " バージョン: ${PROMOTE_TES_TAG}"
  echo " 変更:       ${PROMOTE_TARGET_TAG} → ${PROMOTE_TES_TAG}"
  echo ""
  echo " MR:         ${PROMOTE_MR_URL:-N/A}"
  echo " ArgoCD App: ${argocd_app}"
  echo "=============================================="
  echo ""
  echo "MRをレビュー・承認後にマージしてください。"
}

main "$@"
