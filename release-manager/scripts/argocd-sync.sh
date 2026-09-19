#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load libraries
source "${SCRIPT_DIR}/lib/gitlab-api.sh"
source "${SCRIPT_DIR}/lib/config.sh"

# ==============================================
# ArgoCD Sync Script
# Triggers ArgoCD sync for a service
#
# Required CI variables:
#   SERVICE_NAME      - サービス名 (例: web, order)
#   ARGOCD_AUTH_TOKEN - ArgoCD auth token (TES)
#   K8S_SERVER        - TES EKS API endpoint
#   K8S_TOKEN         - TES K8s ServiceAccount token
#
# PRD環境用 (TARGET=prd):
#   PRD_ARGOCD_AUTH_TOKEN - PRD ArgoCD auth token
#   PRD_K8S_SERVER        - PRD EKS API endpoint
#   PRD_K8S_TOKEN         - PRD K8s ServiceAccount token
#
# Optional:
#   TARGET           - 環境 (tes|prd, default: tes)
#   ARGOCD_NAMESPACE - ArgoCD namespace (default: argocd)
# ==============================================

# K8s API proxy経由でArgoCD APIにアクセスするための関数
# CloudFront WAFをバイパスし、EKS API経由で内部ArgoCD serviceに到達する
PROXY_PID=""
PROXY_BASE_URL=""

start_k8s_proxy() {
  local k8s_server="${K8S_SERVER:-}"
  local k8s_token="${K8S_TOKEN:-}"
  local argocd_namespace="${1:-argocd}"

  if [[ -z "$k8s_server" || -z "$k8s_token" ]]; then
    return 1
  fi

  if ! command -v kubectl &> /dev/null; then
    log::info "kubectl をインストール中..."
    local arch
    arch="$(uname -m)"
    case "$arch" in
      x86_64) arch="amd64" ;;
      aarch64) arch="arm64" ;;
    esac
    curl -sL "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/${arch}/kubectl" \
      -o /usr/local/bin/kubectl
    chmod +x /usr/local/bin/kubectl
  fi

  log::info "K8s API proxy 起動中..."
  kubectl --server="$k8s_server" --token="$k8s_token" --insecure-skip-tls-verify \
    proxy --port=9090 &
  PROXY_PID=$!
  sleep 2

  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    log::error "K8s API proxy の起動に失敗しました"
    return 1
  fi

  PROXY_BASE_URL="http://localhost:9090/api/v1/namespaces/${argocd_namespace}/services/argocd-server:http/proxy"
  log::info "K8s API proxy 起動完了 (PID: ${PROXY_PID})"
  return 0
}

cleanup_proxy() {
  if [[ -n "$PROXY_PID" ]]; then
    kill "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup_proxy EXIT

# ArgoCD APIへのcurlラッパー
# K8s proxy経由の場合はCookie認証、直接アクセスの場合はAuthorizationヘッダー
argocd_curl() {
  local method="$1"
  local path="$2"
  local argocd_token="$3"
  shift 3

  if [[ -n "$PROXY_BASE_URL" ]]; then
    # PROXY経由: $1がargocd_server（空文字列）なのでスキップ
    shift 1
    curl -s -w "\n%{http_code}" -X "$method" \
      "${PROXY_BASE_URL}${path}" \
      -H "Cookie: argocd.token=${argocd_token}" \
      -H "Content-Type: application/json" \
      "$@"
  else
    # 直接接続: $1がargocd_server
    local argocd_server="$1"
    shift 1
    curl -sk -w "\n%{http_code}" -X "$method" \
      "https://${argocd_server}${path}" \
      -H "Authorization: Bearer ${argocd_token}" \
      -H "Content-Type: application/json" \
      "$@"
  fi
}

main() {
  echo "=============================================="
  echo " ArgoCD Sync"
  echo " SERVICE: ${SERVICE_NAME:-未設定}"
  echo " $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================="
  echo ""

  # --- Validate & Load Config ---
  validate_sync_args
  config::resolve_service
  config::load_service

  local argocd_app="${SVC_ARGOCD_APP}"
  local target="${TARGET:-tes}"
  
  # PRD環境の場合はprd_argocd_appを使用
  if [[ "$target" == "prd" ]]; then
    if [[ -z "${SVC_PRD_ARGOCD_APP}" ]]; then
      log::error "PRD ArgoCD app name が release-config.yaml に見つかりません: ${SERVICE_NAME}"
      exit 1
    fi
    argocd_app="${SVC_PRD_ARGOCD_APP}"
    log::info "環境: PRD"
  else
    log::info "環境: TES"
  fi

  # PRD環境は専用tokenを使用（未設定ならTES tokenにフォールバック）
  local argocd_token="${ARGOCD_AUTH_TOKEN:-}"
  if [[ "$target" == "prd" && -n "${PRD_ARGOCD_AUTH_TOKEN:-}" ]]; then
    argocd_token="${PRD_ARGOCD_AUTH_TOKEN}"
    log::info "PRD用 ArgoCD token を使用"
  fi
  local argocd_namespace="${ARGOCD_NAMESPACE:-argocd}"
  local argocd_server=""

  if [[ -z "$argocd_app" ]]; then
    log::error "ArgoCD app name が release-config.yaml に見つかりません: ${SERVICE_NAME}"
    exit 1
  fi

  log::info "ArgoCD app: ${argocd_app}"

  # --- 接続方式の決定 ---
  # PRD環境はPRD用K8S接続情報を使用
  if [[ "$target" == "prd" && -n "${PRD_K8S_SERVER:-}" && -n "${PRD_K8S_TOKEN:-}" ]]; then
    K8S_SERVER="${PRD_K8S_SERVER}"
    K8S_TOKEN="${PRD_K8S_TOKEN}"
    log::info "PRD用 K8S接続情報を使用"
  fi

  if [[ -n "${K8S_SERVER:-}" && -n "${K8S_TOKEN:-}" && -n "$argocd_token" ]]; then
    # 方式1: K8s API proxy経由（推奨）
    if start_k8s_proxy "$argocd_namespace"; then
      log::info "K8s API proxy 経由で ArgoCD に接続"
    else
      log::error "K8s API proxy の起動に失敗"
      exit 1
    fi
  elif [[ -n "${ARGOCD_URL:-}" && -n "$argocd_token" ]]; then
    # 方式2: 直接接続（フォールバック）
    argocd_server="${ARGOCD_URL:-}"
    argocd_server="${argocd_server#https://}"
    argocd_server="${argocd_server#http://}"
    log::info "直接接続で ArgoCD に接続: ${argocd_server}"
  else
    log::error "ArgoCD 接続情報がありません。以下を設定してください:"
    echo "  K8S_SERVER, K8S_TOKEN, ARGOCD_AUTH_TOKEN"
    exit 1
  fi

  # --- Trigger Sync ---
  log::step "ArgoCD Sync: ${argocd_app}"

  log::info "Sync リクエスト送信中..."
  local sync_response
  sync_response="$(argocd_curl POST "/api/v1/applications/${argocd_app}/sync" "$argocd_token" "$argocd_server" -d '{}')"

  local http_code
  http_code="$(echo "$sync_response" | tail -1)"
  local body
  body="$(echo "$sync_response" | sed '$d')"

  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    log::success "ArgoCD Sync を開始しました: ${argocd_app}"
  else
    log::error "ArgoCD Sync 失敗 (HTTP ${http_code})"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    exit 1
  fi

  # --- Wait for Sync ---
  log::info "Sync 完了を待機中..."
  local max_wait=300
  local interval=10
  local elapsed=0

  while (( elapsed < max_wait )); do
    sleep "$interval"
    elapsed=$(( elapsed + interval ))

    local app_response
    app_response="$(argocd_curl GET "/api/v1/applications/${argocd_app}" "$argocd_token" "$argocd_server")"

    # http_codeを除いたbodyを取得
    local resp_body
    resp_body="$(echo "$app_response" | sed '$d')"

    local sync_status
    sync_status="$(echo "$resp_body" | jq -r '.status.sync.status // "Unknown"')"
    local health_status
    health_status="$(echo "$resp_body" | jq -r '.status.health.status // "Unknown"')"
    local operation_phase
    operation_phase="$(echo "$resp_body" | jq -r '.status.operationState.phase // "Unknown"')"

    log::info "状態: sync=${sync_status}, health=${health_status}, phase=${operation_phase} (${elapsed}秒経過)"

    if [[ "$operation_phase" == "Succeeded" ]]; then
      log::success "ArgoCD Sync 完了: ${argocd_app} (${elapsed}秒)"
      echo ""
      echo "  Sync: ${sync_status}"
      echo "  Health: ${health_status}"
      return 0
    fi

    if [[ "$operation_phase" == "Failed" || "$operation_phase" == "Error" ]]; then
      log::error "ArgoCD Sync 失敗: phase=${operation_phase}"
      local message
      message="$(echo "$resp_body" | jq -r '.status.operationState.message // "不明"')"
      echo "  Message: ${message}"
      exit 1
    fi
  done

  log::error "ArgoCD Sync タイムアウト（${max_wait}秒）"
  exit 1
}

# SERVICE_NAME のみ必須（VERSION不要）
validate_sync_args() {
  if [[ -z "${SERVICE_NAME:-}" ]]; then
    log::error "SERVICE_NAME が未設定です"
    exit 1
  fi
  # VERSION は不要なので空にする
  VERSION=""
}

main
