#!/usr/bin/env bash
# lib/argocd.sh — ArgoCD操作（sync, restart, status）

ARGOCD_NS="${KUBE_DEPLOY_ARGOCD_NS:-argocd}"
APP_PREFIX="${KUBE_DEPLOY_APP_PREFIX:-myapp-dev}"
ARGOCD_LOCAL_PORT="${KUBE_DEPLOY_ARGOCD_LOCAL_PORT:-18080}"
ARGOCD_PORT_FWD_PID=""

# port-forward クリーンアップ
argocd_cleanup() {
  if [[ -n "${ARGOCD_PORT_FWD_PID}" ]] && kill -0 "$ARGOCD_PORT_FWD_PID" 2>/dev/null; then
    kill "$ARGOCD_PORT_FWD_PID" 2>/dev/null
  fi
  ARGOCD_PORT_FWD_PID=""
}

# ArgoCD server への port-forward 開始
start_argocd_port_forward() {
  # 自プロセスのport-forwardのみクリーンアップ
  local pids
  pids="$(lsof -ti ":${ARGOCD_LOCAL_PORT}" 2>/dev/null)" || true
  if [[ -n "$pids" ]]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null || true
    done <<< "$pids"
  fi
  kubectl port-forward svc/argocd-server -n "$ARGOCD_NS" "${ARGOCD_LOCAL_PORT}:80" &>/dev/null &
  ARGOCD_PORT_FWD_PID=$!
  sleep 3

  if ! curl -sf -o /dev/null -w "" "http://127.0.0.1:${ARGOCD_LOCAL_PORT}" 2>/dev/null; then
    log_error "ArgoCD port-forward に失敗しました"
    return 1
  fi
}

# ArgoCD API トークン取得
get_argocd_token() {
  local password token_response
  password="$(kubectl -n "$ARGOCD_NS" get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode)"
  token_response="$(printf '{"username":"admin","password":"%s"}' "$password" \
    | curl -sf "http://127.0.0.1:${ARGOCD_LOCAL_PORT}/api/v1/session" \
        -X POST -H 'Content-Type: application/json' \
        --data @-)"
  echo "$token_response" | jq -r '.token'
}

# ArgoCD sync（全サービスまたは指定サービス）
# $1=サービス名（省略時は全サービス）
argocd_sync() {
  local target="${1:-}"

  ensure_kube_context || return 1
  print_header "ArgoCD Sync"
  start_argocd_port_forward || return 1

  local token
  token=$(get_argocd_token)

  local failed=0
  for svc in $(list_services); do
    if [[ -n "$target" && "$svc" != "$target" ]]; then
      continue
    fi

    local app_name="${APP_PREFIX}-${svc}"
    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
      -X POST "http://127.0.0.1:${ARGOCD_LOCAL_PORT}/api/v1/applications/${app_name}/sync" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -d '{}' 2>&1) || true

    if [[ "$http_code" == "200" ]]; then
      log_success "${svc}"
    else
      log_error "${svc} (HTTP ${http_code})"
      failed=1
    fi
  done

  argocd_cleanup

  if [[ "$failed" -eq 1 ]]; then
    log_warn "一部の sync に失敗しました"
  else
    log_success "sync 完了"
  fi
}

# Pod再起動（全サービスまたは指定サービス）
# $1=サービス名（省略時は全サービス）
argocd_restart() {
  local target="${1:-}"

  ensure_kube_context || return 1
  print_header "Pod 再起動"

  local failed=0
  for svc in $(list_services); do
    if [[ -n "$target" && "$svc" != "$target" ]]; then
      continue
    fi

    local ns="${SERVICE_NAMESPACE[$svc]}"
    if kubectl rollout restart "deploy/${svc}" -n "$ns" &>/dev/null; then
      log_success "${ns}/${svc}"
    else
      log_error "${ns}/${svc}"
      failed=1
    fi
  done

  if [[ "$failed" -eq 1 ]]; then
    log_warn "一部の再起動に失敗しました"
    return
  fi

  print_header "Rollout 待機"
  for svc in $(list_services); do
    if [[ -n "$target" && "$svc" != "$target" ]]; then
      continue
    fi

    local ns="${SERVICE_NAMESPACE[$svc]}"
    if kubectl rollout status "deploy/${svc}" -n "$ns" --timeout="${ROLLOUT_TIMEOUT}" &>/dev/null; then
      log_success "${ns}/${svc}"
    else
      log_warn "${ns}/${svc} (timeout)"
    fi
  done

  log_success "再起動完了"
}

# ArgoCD + Pod ステータス表示
argocd_status() {
  ensure_kube_context || return 1

  print_header "ArgoCD Application Status"
  kubectl get applications -n "$ARGOCD_NS" \
    -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status' \
    | grep -E "^NAME|${APP_PREFIX}" \
    || true

  print_header "Pod Status"
  printf "  ${BOLD}%-40s %-10s %s${NC}\n" "SERVICE" "READY" "IMAGE TAG"
  printf "  %-40s %-10s %s\n" "---" "---" "---"
  for svc in $(list_services); do
    local ns="${SERVICE_NAMESPACE[$svc]}"
    local ready image_tag
    ready=$(kubectl get deploy "$svc" -n "$ns" -o jsonpath='{.status.readyReplicas}/{.status.replicas}' 2>/dev/null || echo "?/?")
    image_tag=$(kubectl get deploy "$svc" -n "$ns" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | sed 's/.*://' || echo "?")
    printf "  %-40s %-10s %s\n" "${ns}/${svc}" "${ready}" "${image_tag}"
  done
}
