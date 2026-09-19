#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source API libs for diff checking
source "${SCRIPT_DIR}/lib/gitlab-api.sh"

# List all services defined in release-config.yaml (comma-separated)
# Override via ALL_SERVICES env var or update to match your config
ALL_SERVICES="${ALL_SERVICES:-api-server,web-frontend,worker}"

# Check if a service has diff between release and main
# Runs in subshell to isolate global state from config loading
has_diff() {
  local svc="$1"
  (
    source "${SCRIPT_DIR}/lib/config.sh"
    export SERVICE_NAME="$svc"
    config::resolve_service
    config::load_service

    local compare_json
    compare_json="$(gl::compare "$APP_PROJECT_PATH" "release" "main" 2>/dev/null)" || exit 1

    local commit_count
    commit_count="$(echo "$compare_json" | jq '.commits | length')"
    (( commit_count > 0 ))
  )
}

# --- Parse SERVICE_NAME ---
input="${SERVICE_NAME:-}"

if [[ -z "$input" ]]; then
  echo "[ERROR] SERVICE_NAME が未設定です" >&2
  exit 1
fi

is_all=false
if [[ "$input" == "all" ]]; then
  is_all=true
  input="$ALL_SERVICES"
fi

IFS=',' read -ra SERVICES <<< "$input"

# Trim whitespace
for i in "${!SERVICES[@]}"; do
  SERVICES[$i]="$(echo "${SERVICES[$i]}" | tr -d ' ')"
done

# --- "all" mode: filter to services with release↔main diff ---
if $is_all; then
  echo "=============================================="
  echo " release ↔ main 差分チェック中..."
  echo "=============================================="

  FILTERED=()
  SKIPPED=()
  for svc in "${SERVICES[@]}"; do
    if has_diff "$svc"; then
      echo " [差分あり] ${svc}"
      FILTERED+=("$svc")
    else
      echo " [差分なし] ${svc}"
      SKIPPED+=("$svc")
    fi
  done

  echo ""
  echo "デプロイ対象: ${#FILTERED[@]}件 / スキップ: ${#SKIPPED[@]}件"
  echo ""

  if (( ${#FILTERED[@]} == 0 )); then
    echo "デプロイ対象のサービスがありません。全サービスが最新です。"
    exit 0
  fi

  SERVICES=("${FILTERED[@]}")
fi

# --- Single service: run directly ---
if (( ${#SERVICES[@]} <= 1 )); then
  export SERVICE_NAME="${SERVICES[0]}"
  bash "${SCRIPT_DIR}/deploy.sh"
  # Deploy成功後にArgoCD Sync
  if [[ -n "${K8S_SERVER:-}" && -n "${K8S_TOKEN:-}" && -n "${ARGOCD_AUTH_TOKEN:-}" ]]; then
    echo ""
    bash "${SCRIPT_DIR}/argocd-sync.sh"
  fi
  exit 0
fi

# --- Multiple services: parallel deploy ---
echo "=============================================="
echo " Release Manager Multi Deploy"
echo " SERVICES: ${SERVICES[*]} (${#SERVICES[@]}件)"
echo " VERSION: ${VERSION:-自動}"
echo " DRY_RUN: ${DRY_RUN:-false}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# Multiple services with explicit VERSION is ambiguous
if [[ -n "${VERSION:-}" && "${VERSION}" != "auto" ]]; then
  echo "[WARNING] 複数サービスデプロイ時はVERSIONを空にして自動計算を推奨します"
  echo "[WARNING] 指定VERSION: ${VERSION} が全サービスに適用されます"
  echo ""
fi

LOG_DIR="/tmp/deploy-logs-$$"
mkdir -p "$LOG_DIR"

deploy_start="$(date +%s)"

# Launch all deploys in parallel
declare -A pids

for svc in "${SERVICES[@]}"; do
  echo "[${svc}] デプロイ開始..."
  (
    export SERVICE_NAME="$svc"
    bash "${SCRIPT_DIR}/deploy.sh"
  ) > "${LOG_DIR}/${svc}.log" 2>&1 &
  pids[$svc]=$!
done

echo ""
echo "全 ${#SERVICES[@]} サービスを並列実行中..."
echo ""

# Wait for all and collect results
declare -A results
failed=0
succeeded=0

for svc in "${SERVICES[@]}"; do
  if wait "${pids[$svc]}" 2>/dev/null; then
    results[$svc]="SUCCESS"
    succeeded=$((succeeded + 1))
    echo "[SUCCESS] ${svc}"
  else
    results[$svc]="FAILED"
    failed=$((failed + 1))
    echo "[FAILED]  ${svc}"
  fi
done

deploy_end="$(date +%s)"
total_elapsed=$(( deploy_end - deploy_start ))

# --- Summary ---
echo ""
echo "=============================================="
echo " Multi Deploy 結果"
echo "=============================================="
echo " 成功: ${succeeded}/${#SERVICES[@]}"
echo " 失敗: ${failed}/${#SERVICES[@]}"
echo " 所要時間: ${total_elapsed}秒"
echo ""

for svc in "${SERVICES[@]}"; do
  local_result="${results[$svc]}"
  if [[ "$local_result" == "SUCCESS" ]]; then
    echo " [OK]   ${svc}"
  else
    echo " [FAIL] ${svc}"
  fi
done
echo "=============================================="

# Print failed service logs
if (( failed > 0 )); then
  echo ""
  echo "=============================================="
  echo " 失敗サービスのログ"
  echo "=============================================="
  for svc in "${SERVICES[@]}"; do
    if [[ "${results[$svc]}" == "FAILED" ]]; then
      echo ""
      echo "--- ${svc} ---"
      tail -50 "${LOG_DIR}/${svc}.log"
      echo "--- /${svc} ---"
    fi
  done
fi

# Cleanup
rm -rf "$LOG_DIR"

# --- ArgoCD Sync: 成功したサービスを順次sync ---
if [[ -n "${K8S_SERVER:-}" && -n "${K8S_TOKEN:-}" && -n "${ARGOCD_AUTH_TOKEN:-}" ]] && (( succeeded > 0 )); then
  echo ""
  echo "=============================================="
  echo " ArgoCD Sync 開始"
  echo "=============================================="
  sync_failed=0
  for svc in "${SERVICES[@]}"; do
    if [[ "${results[$svc]}" == "SUCCESS" ]]; then
      echo ""
      export SERVICE_NAME="$svc"
      bash "${SCRIPT_DIR}/argocd-sync.sh" || {
        echo "[WARN] ArgoCD Sync 失敗: ${svc}"
        sync_failed=$((sync_failed + 1))
      }
    fi
  done
  if (( sync_failed > 0 )); then
    echo ""
    echo "[WARN] ArgoCD Sync 失敗: ${sync_failed}件（デプロイ自体は成功）"
  fi
fi

if (( failed > 0 )); then
  exit 1
fi
