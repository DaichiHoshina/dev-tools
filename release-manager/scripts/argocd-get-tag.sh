#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load libraries
source "${SCRIPT_DIR}/lib/gitlab-api.sh"
source "${SCRIPT_DIR}/lib/config.sh"

# ==============================================
# ArgoCD Get Tag Script
# ArgoCD APIからライブimage.tagを取得する
#
# Required CI variables:
#   SERVICE_NAME      - サービス名 (例: web, order)
#   ARGOCD_AUTH_TOKEN - ArgoCD auth token
#   K8S_SERVER        - EKS API endpoint
#   K8S_TOKEN         - K8s ServiceAccount token
#
# Optional:
#   TARGET            - 環境 (tes|prd, default: tes)
#   ARGOCD_NAMESPACE  - ArgoCD namespace (default: argocd)
# ==============================================

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

argocd_curl() {
  local method="$1"
  local path="$2"
  local argocd_token="$3"
  local argocd_server="${4:-}"

  if [[ -n "$PROXY_BASE_URL" ]]; then
    curl -s -w "\n%{http_code}" -X "$method" \
      "${PROXY_BASE_URL}${path}" \
      -H "Cookie: argocd.token=${argocd_token}" \
      -H "Content-Type: application/json"
  else
    curl -sk -w "\n%{http_code}" -X "$method" \
      "https://${argocd_server}${path}" \
      -H "Authorization: Bearer ${argocd_token}" \
      -H "Content-Type: application/json"
  fi
}

main() {
  echo "=============================================="
  echo " ArgoCD Get Tag"
  echo " SERVICE: ${SERVICE_NAME:-未設定}"
  echo " $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================="
  echo ""

  # --- Validate & Load Config ---
  validate_args
  config::resolve_service
  config::load_service

  local argocd_app="${SVC_ARGOCD_APP}"
  local target="${TARGET:-tes}"

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
  if [[ "$target" == "prd" && -n "${PRD_K8S_SERVER:-}" && -n "${PRD_K8S_TOKEN:-}" ]]; then
    K8S_SERVER="${PRD_K8S_SERVER}"
    K8S_TOKEN="${PRD_K8S_TOKEN}"
    log::info "PRD用 K8S接続情報を使用"
  fi

  if [[ -n "${K8S_SERVER:-}" && -n "${K8S_TOKEN:-}" && -n "$argocd_token" ]]; then
    if start_k8s_proxy "$argocd_namespace"; then
      log::info "K8s API proxy 経由で ArgoCD に接続"
    else
      log::error "K8s API proxy の起動に失敗"
      exit 1
    fi
  elif [[ -n "${ARGOCD_URL:-}" && -n "$argocd_token" ]]; then
    argocd_server="${ARGOCD_URL:-}"
    argocd_server="${argocd_server#https://}"
    argocd_server="${argocd_server#http://}"
    log::info "直接接続で ArgoCD に接続: ${argocd_server}"
  else
    log::error "ArgoCD 接続情報がありません。以下を設定してください:"
    echo "  K8S_SERVER, K8S_TOKEN, ARGOCD_AUTH_TOKEN"
    exit 1
  fi

  # --- Get Application Status ---
  log::step "ArgoCD アプリケーション状態取得: ${argocd_app}"

  local app_response
  app_response="$(argocd_curl GET "/api/v1/applications/${argocd_app}" "$argocd_token" "$argocd_server")"

  local http_code
  http_code="$(echo "$app_response" | tail -1)"
  local body
  body="$(echo "$app_response" | sed '$d')"

  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    log::error "ArgoCD アプリケーション取得失敗 (HTTP ${http_code})"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    exit 1
  fi

  # image.tagを抽出
  # spec.source.helm.parameters から image.tag を探す
  local image_tag
  image_tag="$(echo "$body" | jq -r '
    (.status.summary.images // []) as $images |
    (.spec.source.helm.parameters // []) as $params |
    ($params | map(select(.name == "image.tag")) | first | .value // null) as $helm_tag |
    {
      image_tag: ($helm_tag // ($images[0] | split(":") | last) // null)
    } | .image_tag
  ')"

  local sync_status
  sync_status="$(echo "$body" | jq -r '.status.sync.status // "Unknown"')"

  local health_status
  health_status="$(echo "$body" | jq -r '.status.health.status // "Unknown"')"

  log::info "取得完了: tag=${image_tag}, sync=${sync_status}, health=${health_status}"

  # JSON形式で出力（ブラウザ側で抽出する用）
  # jq -n で安全なJSON生成（null値はJSON nullとして出力）
  local json_output
  json_output="$(jq -n \
    --arg t "$image_tag" \
    --arg s "$sync_status" \
    --arg h "$health_status" \
    '{
      image_tag: (if $t == "null" or $t == "" then null else $t end),
      sync_status: (if $s == "Unknown" then null else $s end),
      health: (if $h == "Unknown" then null else $h end)
    }')"
  echo "ARGOCD_LIVE_STATE::${json_output}"
}

validate_args() {
  if [[ -z "${SERVICE_NAME:-}" ]]; then
    log::error "SERVICE_NAME が未設定です"
    exit 1
  fi
}

main
