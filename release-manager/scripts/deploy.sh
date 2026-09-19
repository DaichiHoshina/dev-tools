#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load libraries
source "${SCRIPT_DIR}/lib/gitlab-api.sh"
source "${SCRIPT_DIR}/lib/config.sh"
source "${SCRIPT_DIR}/lib/app-mr.sh"
source "${SCRIPT_DIR}/lib/tag.sh"
source "${SCRIPT_DIR}/lib/helm.sh"
source "${SCRIPT_DIR}/lib/migration.sh"

# ==============================================
# Release Manager - GitLab CI/CD Deploy Script
# ==============================================

main() {
  echo "=============================================="
  echo " Release Manager Deploy"
  echo " SERVICE: ${SERVICE_NAME:-未設定}"
  echo " VERSION: ${VERSION:-自動}"
  echo " DRY_RUN: ${DRY_RUN:-false}"
  echo " SKIP_APP_MR: ${SKIP_APP_MR:-false}"
  echo " $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================="
  echo ""

  # --- Validate & Load Config ---
  config::validate
  config::resolve_service
  config::load_service
  config::auto_version

  echo ""
  log::info "デプロイ開始: ${SVC_CONFIG_KEY} ${TAG_NAME}"
  echo ""

  local deploy_start
  deploy_start="$(date +%s)"

  # --- 含まれる変更を収集（マージ前に実行） ---
  helm::collect_changes

  # --- Step 1-3: App MR & Release Pipeline ---
  app_mr::create_or_find
  app_mr::approve_and_merge
  app_mr::wait_release_pipeline

  # --- Migration check ---
  migration::check_and_notify

  # --- Step 4-5: Tag & Tag Pipeline ---
  tag::create_or_skip
  tag::wait_pipeline

  # --- Step 6-7: Helm MR ---
  helm::create_branch
  helm::update_values
  helm::create_mr_or_find
  helm::approve_and_merge

  # --- Step 8: Helm Pipeline ---
  helm::wait_pipeline

  # --- Summary ---
  local deploy_end
  deploy_end="$(date +%s)"
  local total_elapsed=$(( deploy_end - deploy_start ))

  echo ""
  echo "=============================================="
  echo " デプロイ完了"
  echo "=============================================="
  echo " サービス:   ${SVC_CONFIG_KEY}"
  echo " バージョン: ${TAG_NAME}"
  echo " 所要時間:   ${total_elapsed}秒"
  echo ""
  echo " App MR:     ${APP_MR_URL:-N/A}"
  echo " Tag Pipeline: ${TAG_PIPELINE_URL:-N/A}"
  echo " Helm MR:    ${HELM_MR_URL:-N/A}"
  echo " Helm Pipeline: ${HELM_PIPELINE_URL:-N/A}"
  echo " ArgoCD App: ${SVC_ARGOCD_APP}"
  echo "=============================================="
}

main "$@"
