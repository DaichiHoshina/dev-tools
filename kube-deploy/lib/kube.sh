#!/usr/bin/env bash
# lib/kube.sh — kubectl操作（set image、ConfigMap R/W、rollout）

# dev context の検証（複数の有効な context 名に対応）
ensure_kube_context() {
  local current
  current="$(kubectl config current-context 2>/dev/null)" || {
    log_error "kubectl context が取得できません"
    log_info "kubectl config use-context ${KUBE_CONTEXTS[0]}"
    return 1
  }
  for valid in "${KUBE_CONTEXTS[@]}"; do
    if [[ "$current" == "$valid" ]]; then
      return 0
    fi
  done
  log_error "現在の context: $current"
  log_error "期待する context: ${KUBE_CONTEXTS[*]}"
  return 1
}

# ConfigMap が存在しなければ作成
ensure_configmap_exists() {
  if kubectl get configmap "$CONFIGMAP_NAME" -n "$CONFIGMAP_NS" &>/dev/null; then
    return 0
  fi
  log_info "ConfigMap ${CONFIGMAP_NAME} を作成中..."
  if ! kubectl create configmap "$CONFIGMAP_NAME" \
    -n "$CONFIGMAP_NS" \
    --from-literal=overrides='{"version":1,"overrides":{}}' \
    2>/dev/null; then
    # 競合（別プロセスで作成済み）の場合は成功とみなす
    if kubectl get configmap "$CONFIGMAP_NAME" -n "$CONFIGMAP_NS" &>/dev/null; then
      return 0
    fi
    log_error "ConfigMap の作成に失敗しました"
    return 1
  fi
  log_success "ConfigMap を作成しました"
}

# ConfigMap からオーバーライドJSON を読み込み
# stdout に JSON を出力
read_configmap_overrides() {
  local data
  data="$(kubectl get configmap "$CONFIGMAP_NAME" -n "$CONFIGMAP_NS" \
    -o jsonpath='{.data.overrides}' 2>/dev/null)" || {
    echo '{"version":1,"overrides":{}}'
    return
  }
  if [[ -z "$data" ]]; then
    echo '{"version":1,"overrides":{}}'
  else
    echo "$data"
  fi
}

# ConfigMap のオーバーライドエントリを更新
# $1=service, $2=ticket, $3=override_tag, $4=original_tag, $5=mr_url, $6=deployed_by(MR作成者), $7=ttl_hours(optional)
update_configmap_override() {
  local service="$1" ticket="$2" override_tag="$3" original_tag="$4" mr_url="$5"
  local deployed_by="${6:-$(whoami)}"
  local ttl_hours="${7:-$DEFAULT_TTL_HOURS}"
  local run_by deployed_at ns ecr_repo
  run_by="$(whoami)"
  deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ns="${SERVICE_NAMESPACE[$service]}"
  ecr_repo="${SERVICE_ECR_REPO[$service]}"

  local current_json new_json
  current_json="$(read_configmap_overrides)"

  new_json="$(echo "$current_json" | jq \
    --arg svc "$service" \
    --arg ticket "$ticket" \
    --arg ns "$ns" \
    --arg ecr "$ecr_repo" \
    --arg orig "$original_tag" \
    --arg over "$override_tag" \
    --arg by "$deployed_by" \
    --arg run "$run_by" \
    --arg at "$deployed_at" \
    --argjson ttl "$ttl_hours" \
    --arg mr "$mr_url" \
    '.overrides[$svc] = {
      ticket: $ticket,
      namespace: $ns,
      ecr_repo: $ecr,
      original_tag: $orig,
      override_tag: $over,
      deployed_by: $by,
      run_by: $run,
      deployed_at: $at,
      ttl_hours: $ttl,
      mr_url: $mr
    }')"

  if ! kubectl patch configmap "$CONFIGMAP_NAME" -n "$CONFIGMAP_NS" \
    --type merge \
    -p "{\"data\":{\"overrides\":$(echo "$new_json" | jq -c . | jq -Rs .)}}" \
    2>/dev/null; then
    log_error "ConfigMap の更新に失敗しました: ${service}"
    return 1
  fi
}

# ConfigMap からオーバーライドエントリを削除
remove_configmap_override() {
  local service="$1"
  local current_json new_json
  current_json="$(read_configmap_overrides)"

  new_json="$(echo "$current_json" | jq --arg svc "$service" 'del(.overrides[$svc])')"

  if ! kubectl patch configmap "$CONFIGMAP_NAME" -n "$CONFIGMAP_NS" \
    --type merge \
    -p "{\"data\":{\"overrides\":$(echo "$new_json" | jq -c . | jq -Rs .)}}" \
    2>/dev/null; then
    log_error "ConfigMap の削除に失敗しました: ${service}"
    return 1
  fi
}

# デプロイメントのイメージを変更
set_deployment_image() {
  local service="$1" namespace="$2" full_image="$3"
  kubectl set image "deployment/${service}" "${service}=${full_image}" \
    -n "$namespace"
}

# 現在のイメージタグを取得
get_current_image_tag() {
  local service="$1" namespace="$2"
  local image
  image="$(kubectl get deployment "$service" -n "$namespace" \
    -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)" || return 1
  echo "${image##*:}"
}

# rollout status を待機（タイムアウト付き）
wait_rollout() {
  local service="$1" namespace="$2" timeout="${3:-$ROLLOUT_TIMEOUT}"
  kubectl rollout status "deployment/${service}" -n "$namespace" --timeout="$timeout"
}
