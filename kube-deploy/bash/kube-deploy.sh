#!/opt/homebrew/bin/bash
# kube-deploy — dev/tes環境イメージオーバーライドCLI（Bash版）
#
# Usage:
#   kube-deploy <TICKET>                   チケット番号で自動デプロイ
#   kube-deploy set <SERVICE> --tag <TAG>  手動指定
#   kube-deploy status                     状態一覧
#   kube-deploy reset <TICKET|SERVICE>     リセット
#   kube-deploy reset --mine               自分の全リセット
#   kube-deploy --help                     ヘルプ表示

set -euo pipefail

# --- Bash 4.3+ チェック（nameref: local -n 使用のため） ---
if [[ "${BASH_VERSINFO[0]}" -lt 4 ]] || [[ "${BASH_VERSINFO[0]}" -eq 4 && "${BASH_VERSINFO[1]}" -lt 3 ]]; then
  echo "エラー: Bash 4.3以降が必要です（現在: $BASH_VERSION）"
  echo "  brew install bash"
  exit 1
fi

# --- スクリプト配置パス（symlink解決） ---
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_SOURCE" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  [[ "$SCRIPT_SOURCE" != /* ]] && SCRIPT_SOURCE="${SCRIPT_DIR}/${SCRIPT_SOURCE}"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"

# --- ライブラリ読み込み ---
source "${SCRIPT_DIR}/lib/ui.sh"
source "${SCRIPT_DIR}/lib/config.sh"
source "${SCRIPT_DIR}/lib/kube.sh"
source "${SCRIPT_DIR}/lib/gitlab.sh"
source "${SCRIPT_DIR}/lib/ecr.sh"
source "${SCRIPT_DIR}/lib/argocd.sh"

# --- グローバルオプション ---
DRY_RUN=false
FORCE=false
TTL_HOURS="$DEFAULT_TTL_HOURS"

# ======================================================
# ヘルプ
# ======================================================
show_help() {
  cat <<'EOF'
kube-deploy — Kubernetes dev環境デプロイ・管理CLI（Bash版）

Usage:
  kube-deploy <TICKET>                   チケット関連MRの最新コミットをデプロイ
  kube-deploy <MR_URL>                   MR URLを指定してデプロイ
  kube-deploy set <SERVICE> --tag <TAG>  手動でサービスのイメージタグを指定
  kube-deploy update                     自分のデプロイを最新コミットに一括更新
  kube-deploy diff                       latestとの差分表示（誰が何を変えたか）
  kube-deploy status                     オーバーライド + ArgoCD + Pod 状態表示
  kube-deploy reset <TICKET|SERVICE>     チケットまたはサービスをリセット
  kube-deploy reset --mine               自分のオーバーライドを全てリセット
  kube-deploy sync [SERVICE]             ArgoCD sync（省略時は全サービス）
  kube-deploy restart [SERVICE]          Pod再起動（省略時は全サービス）

Options:
  --dry-run     実行せずに計画だけ表示
  --force       競合警告をスキップ
  --ttl <HOURS> TTL時間（デフォルト: 24）
  --help        このヘルプを表示

Environment variables:
  KUBE_DEPLOY_ECR_REGISTRY     ECRレジストリURL
  KUBE_DEPLOY_KUBE_CONTEXT     kubectlコンテキスト名
  KUBE_DEPLOY_GITLAB_GROUP     GitLabグループパス（URLエンコード済み）
  KUBE_DEPLOY_APP_PREFIX       ArgoCDアプリ名プレフィックス
  KUBE_DEPLOY_CONFIGMAP_NAME   ConfigMap名
  KUBE_DEPLOY_SLACK_WEBHOOK_URL Slack Webhook URL（任意）

Examples:
  kube-deploy TICKET-123
  kube-deploy https://gitlab.example.com/myorg/application/api-server/-/merge_requests/62
  kube-deploy set api-server --tag dev-abc123def456
  kube-deploy update
  kube-deploy diff
  kube-deploy status
  kube-deploy reset TICKET-123
  kube-deploy sync
  kube-deploy sync api-server
  kube-deploy restart worker
EOF
}

# ======================================================
# 前提条件チェック
# ======================================================
check_prerequisites() {
  local has_error=false
  for cmd in glab aws kubectl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      log_error "${cmd} がインストールされていません"
      has_error=true
    fi
  done
  $has_error && return 1
  return 0
}

# ======================================================
# パイプラインステータス判定（共通）
# $1=service, $2=status, $3=pipeline_url(optional)
# return: 0=デプロイ可, 1=スキップ
# ======================================================
check_pipeline_deployable() {
  local svc="$1" status="$2" pipeline_url="${3:-}"

  case "$status" in
    success)
      return 0
      ;;
    running|pending|created|preparing|waiting_for_resource)
      log_error "${svc}: CI実行中（${status}）— ビルド完了を待ってください"
      [[ -n "$pipeline_url" ]] && log_info "  パイプライン: ${pipeline_url}"
      return 1
      ;;
    failed)
      log_error "${svc}: CI失敗 — デプロイできません"
      [[ -n "$pipeline_url" ]] && log_info "  パイプライン: ${pipeline_url}"
      return 1
      ;;
    canceled)
      log_warn "${svc}: CIキャンセル済 — デプロイできません"
      return 1
      ;;
    *)
      log_warn "${svc}: パイプライン情報なし — デプロイを試行します"
      return 0
      ;;
  esac
}

# ======================================================
# サブコマンド: diff
# ======================================================
cmd_diff() {
  ensure_kube_context || return 1
  ensure_configmap_exists

  local overrides_json
  overrides_json="$(read_configmap_overrides)"

  local has_diff=false

  for svc in $(list_services); do
    local ns="${SERVICE_NAMESPACE[$svc]}"
    local current_tag
    current_tag="$(get_current_image_tag "$svc" "$ns" 2>/dev/null)" || current_tag="latest"

    if [[ "$current_tag" != "latest" ]]; then
      if [[ "$has_diff" == false ]]; then
        print_header "オーバーライド中のサービス"
        printf "${BOLD}%-30s %-14s %-12s %-22s %s${NC}\n" \
          "サービス" "タグ" "チケット" "デプロイ者" "MR"
        printf "%-30s %-14s %-12s %-22s %s\n" \
          "---" "---" "---" "---" "---"
        has_diff=true
      fi

      # ConfigMapから追加情報を取得
      local ticket deployed_by mr_url
      ticket="$(echo "$overrides_json" | jq -r --arg svc "$svc" '.overrides[$svc].ticket // "-"')"
      deployed_by="$(echo "$overrides_json" | jq -r --arg svc "$svc" '.overrides[$svc].deployed_by // "-"')"
      mr_url="$(echo "$overrides_json" | jq -r --arg svc "$svc" '.overrides[$svc].mr_url // "-"')"

      # タグを短縮表示（dev-SHA → 先頭12文字）
      local short_tag="$current_tag"
      if [[ ${#current_tag} -gt 12 ]]; then
        short_tag="${current_tag:0:12}..."
      fi

      printf "%-30s %-14s %-12s %-22s %s\n" \
        "${ns}/${svc}" "$short_tag" "$ticket" "$deployed_by" "$mr_url"
    fi
  done

  if [[ "$has_diff" == false ]]; then
    log_success "差分なし — 全サービス latest で稼働中"
  fi
}

# ======================================================
# サブコマンド: status
# ======================================================
cmd_status() {
  ensure_kube_context || return 1
  ensure_configmap_exists

  local overrides_json
  overrides_json="$(read_configmap_overrides)"

  local count
  count="$(echo "$overrides_json" | jq '.overrides | length')"

  if [[ "$count" -eq 0 ]]; then
    log_info "現在オーバーライドされているサービスはありません"
    return 0
  fi

  print_header "オーバーライド状態 (${count} サービス)"
  printf "${BOLD}%-28s %-10s %-14s %-20s %-20s %s${NC}\n" \
    "サービス" "チケット" "デプロイ者" "デプロイ日時" "TTL残" "MR"
  printf "%-28s %-10s %-14s %-20s %-20s %s\n" \
    "---" "---" "---" "---" "---" "---"

  echo "$overrides_json" | jq -r '.overrides | to_entries[] | [
    .key,
    .value.ticket,
    .value.deployed_by,
    .value.deployed_at,
    .value.ttl_hours,
    .value.mr_url
  ] | @tsv' | while IFS=$'\t' read -r svc ticket deployed_by deployed_at ttl_hours mr_url; do
    # TTL残計算
    local now_epoch deployed_epoch elapsed_hours remaining
    now_epoch="$(date -u +%s)"
    deployed_epoch="$(date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$deployed_at" +%s 2>/dev/null || date -d "$deployed_at" +%s 2>/dev/null || echo 0)"
    if [[ "$deployed_epoch" -gt 0 ]]; then
      elapsed_hours=$(( (now_epoch - deployed_epoch) / 3600 ))
      remaining=$(( ttl_hours - elapsed_hours ))
      if [[ "$remaining" -le 0 ]]; then
        remaining="${RED}期限切れ${NC}"
      else
        remaining="${remaining}h"
      fi
    else
      remaining="不明"
    fi

    printf "%-28s %-10s %-14s %-20s %-20b %s\n" \
      "$svc" "$ticket" "$deployed_by" "$deployed_at" "$remaining" "$mr_url"
  done
  echo ""

  # ArgoCD + Pod ステータス
  argocd_status
}

# ======================================================
# サブコマンド: reset
# ======================================================
cmd_reset() {
  local target="$1"
  ensure_kube_context || return 1
  ensure_configmap_exists

  local overrides_json
  overrides_json="$(read_configmap_overrides)"

  if [[ "$target" == "--mine" ]]; then
    # 自分のオーバーライドを全てリセット
    local me
    me="$(whoami)"
    local services_to_reset
    services_to_reset="$(echo "$overrides_json" | jq -r \
      --arg by "$me" \
      '.overrides | to_entries[] | select((.value.run_by // .value.deployed_by) == $by) | .key')"

    if [[ -z "$services_to_reset" ]]; then
      log_info "リセット対象のオーバーライドはありません（user: ${me}）"
      return 0
    fi

    log_info "以下のサービスをリセットします（user: ${me}）:"
    echo "$services_to_reset" | while read -r svc; do
      echo "  - $svc"
    done

    if ! $FORCE; then
      confirm "リセットを実行しますか？" || { log_info "キャンセルしました"; return 0; }
    fi

    echo "$services_to_reset" | while read -r svc; do
      reset_single_service "$svc" "$overrides_json"
    done
    return 0
  fi

  # チケット番号で検索 or サービス名直接指定
  if is_valid_service "$target"; then
    # サービス名で直接リセット
    local entry
    entry="$(echo "$overrides_json" | jq -r --arg svc "$target" '.overrides[$svc] // empty')"
    if [[ -z "$entry" ]]; then
      log_info "${target} はオーバーライドされていません"
      return 0
    fi
    if ! $FORCE; then
      confirm "${target} をリセットしますか？" || { log_info "キャンセルしました"; return 0; }
    fi
    reset_single_service "$target" "$overrides_json"
  else
    # チケット番号として扱う
    local services_to_reset
    services_to_reset="$(echo "$overrides_json" | jq -r \
      --arg ticket "$target" \
      '.overrides | to_entries[] | select(.value.ticket == $ticket) | .key')"

    if [[ -z "$services_to_reset" ]]; then
      log_info "チケット ${target} のオーバーライドは見つかりません"
      return 0
    fi

    log_info "チケット ${target} の以下のサービスをリセットします:"
    echo "$services_to_reset" | while read -r svc; do
      echo "  - $svc"
    done

    if ! $FORCE; then
      confirm "リセットを実行しますか？" || { log_info "キャンセルしました"; return 0; }
    fi

    echo "$services_to_reset" | while read -r svc; do
      reset_single_service "$svc" "$overrides_json"
    done
  fi
}

# 単一サービスのリセット
reset_single_service() {
  local svc="$1" overrides_json="$2"
  local ns original_tag ecr_repo

  ns="${SERVICE_NAMESPACE[$svc]}"
  original_tag="$(echo "$overrides_json" | jq -r --arg svc "$svc" '.overrides[$svc].original_tag')"
  ecr_repo="${SERVICE_ECR_REPO[$svc]}"

  if [[ "$original_tag" == "null" || -z "$original_tag" || "$original_tag" == "unknown" ]]; then
    original_tag="latest"
  fi

  local full_image
  full_image="$(make_full_image "$ecr_repo" "$original_tag")"

  if $DRY_RUN; then
    log_info "[DRY-RUN] ${svc}: kubectl set image → ${original_tag}"
    return 0
  fi

  log_info "${svc}: イメージを ${original_tag} に戻しています..."
  if set_deployment_image "$svc" "$ns" "$full_image"; then
    remove_configmap_override "$svc"
    log_success "${svc}: リセット完了"
  else
    log_error "${svc}: リセットに失敗しました"
    return 1
  fi
}

# ======================================================
# サブコマンド: set（手動指定）
# ======================================================
cmd_set() {
  local service="" tag="" ticket="manual"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="$2"; shift 2 ;;
      --ticket) ticket="$2"; shift 2 ;;
      *)
        if [[ -z "$service" ]]; then
          service="$1"; shift
        else
          log_error "不明な引数: $1"; return 1
        fi
        ;;
    esac
  done

  if [[ -z "$service" || -z "$tag" ]]; then
    log_error "Usage: kube-deploy set <SERVICE> --tag <TAG>"
    return 1
  fi

  if ! is_valid_service "$service"; then
    log_error "不明なサービス: ${service}"
    log_info "有効なサービス: $(list_services | tr '\n' ' ')"
    return 1
  fi

  ensure_kube_context || return 1
  ensure_configmap_exists

  local ns="${SERVICE_NAMESPACE[$service]}"
  local ecr_repo="${SERVICE_ECR_REPO[$service]}"

  # ECR イメージ確認（ベストエフォート）
  if check_aws_auth 2>/dev/null; then
    if ! ecr_image_exists "$ecr_repo" "$tag"; then
      log_warn "ECR にイメージが見つかりません: ${ecr_repo}:${tag}"
      log_info "CI/CDのビルドが完了しているか確認してください"
    fi
  fi

  # 競合チェック
  check_conflict "$service" || return 1

  # 現在のタグを取得
  local current_tag
  current_tag="$(get_current_image_tag "$service" "$ns")" || current_tag="latest"

  local full_image
  full_image="$(make_full_image "$ecr_repo" "$tag")"

  log_info "${service}: ${current_tag} → ${tag}"

  if $DRY_RUN; then
    log_info "[DRY-RUN] kubectl set image deployment/${service} ${service}=${full_image} -n ${ns}"
    return 0
  fi

  if ! confirm "デプロイしますか？" && ! $FORCE; then
    log_info "キャンセルしました"
    return 0
  fi

  if set_deployment_image "$service" "$ns" "$full_image"; then
    update_configmap_override "$service" "$ticket" "$tag" "$current_tag" "manual" "" "$TTL_HOURS"
    log_success "${service}: デプロイ完了"
    log_info "rollout status を確認中..."
    wait_rollout "$service" "$ns" "$ROLLOUT_TIMEOUT" || log_warn "rollout がタイムアウトしました。kubectl get pods -n ${ns} で確認してください"
  else
    log_error "${service}: デプロイに失敗しました"
    return 1
  fi
}

# ======================================================
# サブコマンド: <TICKET>（メインフロー）
# ======================================================
cmd_deploy_ticket() {
  local ticket="$1"

  # 前提条件
  check_prerequisites || return 1
  check_glab_auth || return 1
  ensure_kube_context || return 1
  ensure_configmap_exists

  # MR検索
  print_header "MR検索: ${ticket}"
  local mrs_json
  mrs_json="$(search_mrs_by_ticket "$ticket")" || return 1

  local mr_count
  mr_count="$(echo "$mrs_json" | jq 'length')"
  if [[ "$mr_count" -eq 0 ]]; then
    log_error "チケット ${ticket} に関連するオープンMRが見つかりません"
    return 1
  fi
  log_info "${mr_count} 件のMRが見つかりました"

  # サービスマッピング
  local mapped_json
  mapped_json="$(map_mrs_to_services "$mrs_json")"

  local mapped_count
  mapped_count="$(echo "$mapped_json" | jq 'length')"
  if [[ "$mapped_count" -eq 0 ]]; then
    log_error "マッピング可能なサービスが見つかりません"
    echo "$mrs_json" | jq -r '.[].project_path' | while read -r p; do
      log_warn "  不明なプロジェクト: $p"
    done
    return 1
  fi

  # デプロイ計画構築（パイプラインステータスで判定）
  print_header "デプロイ計画構築"
  local deploy_plan=()
  local skipped=0

  for ((i = 0; i < mapped_count; i++)); do
    local svc sha web_url pipeline_status author tag

    svc="$(echo "$mapped_json" | jq -r ".[$i].service")"
    sha="$(echo "$mapped_json" | jq -r ".[$i].sha")"
    web_url="$(echo "$mapped_json" | jq -r ".[$i].web_url")"
    pipeline_status="$(echo "$mapped_json" | jq -r ".[$i].pipeline_status")"
    author="$(echo "$mapped_json" | jq -r ".[$i].author")"

    tag="$(make_image_tag "$sha")"

    if check_pipeline_deployable "$svc" "$pipeline_status" "${web_url}/pipelines"; then
      [[ "$pipeline_status" == "success" ]] && log_success "${svc}: CI成功 → ${tag}"
      deploy_plan+=("${svc}|${SERVICE_NAMESPACE[$svc]}|${tag}|${web_url}|${author}")
    else
      skipped=$((skipped + 1))
    fi
  done

  if [[ $skipped -gt 0 ]]; then
    log_info "${skipped} 件のサービスをスキップしました（CI未完了/失敗）"
  fi

  if [[ ${#deploy_plan[@]} -eq 0 ]]; then
    log_error "デプロイ可能なサービスがありません"
    return 1
  fi

  # 競合チェック
  print_header "競合チェック"
  local clean_plan=()
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag mr_url author <<< "$entry"
    if check_conflict "$svc"; then
      clean_plan+=("$entry")
    fi
  done
  deploy_plan=("${clean_plan[@]}")

  # デプロイ計画表示
  print_deploy_plan deploy_plan

  if $DRY_RUN; then
    log_info "[DRY-RUN] ここで終了します"
    return 0
  fi

  # 確認
  if ! confirm "上記の計画でデプロイしますか？"; then
    log_info "キャンセルしました"
    return 0
  fi

  # デプロイ実行
  print_header "デプロイ実行"
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag mr_url author <<< "$entry"
    local ecr_repo="${SERVICE_ECR_REPO[$svc]}"
    local full_image
    full_image="$(make_full_image "$ecr_repo" "$tag")"

    # 現在のタグを保存
    local current_tag
    current_tag="$(get_current_image_tag "$svc" "$ns")" || current_tag="latest"

    log_info "${svc}: デプロイ中..."
    if set_deployment_image "$svc" "$ns" "$full_image"; then
      update_configmap_override "$svc" "$ticket" "$tag" "$current_tag" "$mr_url" "$author" "$TTL_HOURS"
      log_success "${svc}: イメージを更新しました"
    else
      log_error "${svc}: デプロイに失敗しました"
    fi
  done

  # rollout待機
  print_header "Rollout Status"
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag mr_url author <<< "$entry"
    log_info "${svc}: rollout を待機中..."
    if wait_rollout "$svc" "$ns" "$ROLLOUT_TIMEOUT"; then
      log_success "${svc}: rollout 完了"
    else
      log_warn "${svc}: rollout がタイムアウトしました"
      log_info "  確認: kubectl get pods -n ${ns}"
    fi
  done

  echo ""
  log_success "デプロイ完了 (ticket: ${ticket})"
  log_info "状態確認: kube-deploy status"
  log_info "リセット: kube-deploy reset ${ticket}"
}

# ======================================================
# サブコマンド: MR URL でデプロイ
# ======================================================
cmd_deploy_mr_url() {
  local mr_url="$1"

  # URL解析: https://{gitlab_host}/{project_path}/-/merge_requests/{iid}
  local project_path mr_iid
  project_path="$(echo "$mr_url" | sed -E 's|https?://[^/]+/(.+)/-/merge_requests/[0-9]+.*|\1|')"
  mr_iid="$(echo "$mr_url" | sed -E 's|.*/merge_requests/([0-9]+).*|\1|')"

  if [[ -z "$project_path" || -z "$mr_iid" || "$project_path" == "$mr_url" || ! "$mr_iid" =~ ^[0-9]+$ ]]; then
    log_error "MR URLのパースに失敗しました: ${mr_url}"
    return 1
  fi

  local service="${GITLAB_TO_SERVICE[$project_path]:-}"
  if [[ -z "$service" ]]; then
    log_error "不明なプロジェクト: ${project_path}"
    log_info "マッピングされているプロジェクト:"
    for p in "${!GITLAB_TO_SERVICE[@]}"; do
      log_info "  ${p} → ${GITLAB_TO_SERVICE[$p]}"
    done
    return 1
  fi

  # 前提条件
  check_prerequisites || return 1
  check_glab_auth || return 1
  ensure_kube_context || return 1
  ensure_configmap_exists

  # MR情報取得
  local encoded_project
  encoded_project="${project_path//\//%2F}"

  local mr_json
  mr_json="$(glab api "/projects/${encoded_project}/merge_requests/${mr_iid}" 2>/dev/null)" || {
    log_error "MR情報の取得に失敗: ${mr_url}"
    return 1
  }

  local sha title ticket pipeline_status mr_author
  sha="$(echo "$mr_json" | jq -r '.sha')"
  title="$(echo "$mr_json" | jq -r '.title')"
  pipeline_status="$(echo "$mr_json" | jq -r '.head_pipeline.status // .pipeline.status // "unknown"')"
  mr_author="$(echo "$mr_json" | jq -r '.author.username // empty')"

  # ブランチ名やタイトルからチケット番号を抽出（grep no-matchでも終了しないよう || true）
  ticket="$(echo "$mr_json" | jq -r '.source_branch' | grep -oE '[A-Z]+-[0-9]+' | head -1)" || true
  [[ -z "$ticket" ]] && ticket="$(echo "$title" | grep -oE '[A-Z]+-[0-9]+' | head -1)" || true
  [[ -z "$ticket" ]] && ticket="MR-${mr_iid}"

  local ns="${SERVICE_NAMESPACE[$service]}"
  local ecr_repo="${SERVICE_ECR_REPO[$service]}"
  local tag
  tag="$(make_image_tag "$sha")"
  local full_image
  full_image="$(make_full_image "$ecr_repo" "$tag")"

  # パイプラインステータス確認
  local pipeline_web_url
  pipeline_web_url="$(echo "$mr_json" | jq -r '.head_pipeline.web_url // .pipeline.web_url // empty')"
  if ! check_pipeline_deployable "$service" "$pipeline_status" "$pipeline_web_url"; then
    return 1
  fi
  [[ "$pipeline_status" == "success" ]] && log_success "${service}: CI成功 → ${tag}"

  # 競合チェック
  check_conflict "$service" || return 0

  # 現在のタグを取得
  local current_tag
  current_tag="$(get_current_image_tag "$service" "$ns")" || current_tag="latest"

  print_header "デプロイ計画"
  log_info "サービス:  ${service} (${ns})"
  log_info "MR:        !${mr_iid} ${title}"
  log_info "チケット:  ${ticket}"
  log_info "タグ:      ${current_tag} → ${tag}"
  echo ""

  if $DRY_RUN; then
    log_info "[DRY-RUN] kubectl set image deployment/${service} ${service}=${full_image} -n ${ns}"
    return 0
  fi

  if ! confirm "デプロイしますか？"; then
    log_info "キャンセルしました"
    return 0
  fi

  log_info "${service}: デプロイ中..."
  if set_deployment_image "$service" "$ns" "$full_image"; then
    update_configmap_override "$service" "$ticket" "$tag" "$current_tag" "$mr_url" "$mr_author" "$TTL_HOURS"
    log_success "${service}: デプロイ完了"
    log_info "rollout を待機中..."
    wait_rollout "$service" "$ns" "$ROLLOUT_TIMEOUT" || log_warn "rollout がタイムアウトしました。kubectl get pods -n ${ns} で確認してください"
  else
    log_error "${service}: デプロイに失敗しました"
    return 1
  fi

  echo ""
  log_success "完了 (${ticket})"
  log_info "状態確認: kube-deploy status"
  log_info "リセット: kube-deploy reset ${service}"
}

# ======================================================
# 競合チェック
# ======================================================
check_conflict() {
  local service="$1"
  local overrides_json
  overrides_json="$(read_configmap_overrides)"

  local entry
  entry="$(echo "$overrides_json" | jq -r --arg svc "$service" '.overrides[$svc] // empty')"

  if [[ -n "$entry" ]]; then
    local other_by other_ticket other_at
    other_by="$(echo "$entry" | jq -r '.deployed_by')"
    other_ticket="$(echo "$entry" | jq -r '.ticket')"
    other_at="$(echo "$entry" | jq -r '.deployed_at')"

    log_warn "${service}: 現在 ${other_by} が ${other_ticket} でオーバーライド中 (${other_at})"
    if ! $FORCE; then
      if ! confirm "上書きしますか？"; then
        log_info "${service} をスキップします"
        return 1
      fi
    fi
  fi
  return 0
}

# ======================================================
# サブコマンド: update（自分のデプロイを最新コミットに更新）
# ======================================================
cmd_update() {
  check_prerequisites || return 1
  check_glab_auth || return 1
  ensure_kube_context || return 1
  ensure_configmap_exists

  local me
  me="$(whoami)"

  local overrides_json
  overrides_json="$(read_configmap_overrides)"

  # run_by が自分のエントリを抽出（後方互換: run_by がない場合 deployed_by を参照）
  local my_services
  my_services="$(echo "$overrides_json" | jq -r \
    --arg by "$me" \
    '[.overrides | to_entries[] | select((.value.run_by // .value.deployed_by) == $by)] | sort_by(.key)')"

  local count
  count="$(echo "$my_services" | jq 'length')"

  if [[ "$count" -eq 0 ]]; then
    log_info "現在オーバーライドしているサービスはありません（user: ${me}）"
    return 0
  fi

  print_header "更新チェック (${count} サービス)"
  local deploy_plan=()
  local skipped=0
  local up_to_date=0

  for ((i = 0; i < count; i++)); do
    local svc mr_url current_override_tag ticket
    svc="$(echo "$my_services" | jq -r ".[$i].key")"
    mr_url="$(echo "$my_services" | jq -r ".[$i].value.mr_url")"
    current_override_tag="$(echo "$my_services" | jq -r ".[$i].value.override_tag")"
    ticket="$(echo "$my_services" | jq -r ".[$i].value.ticket")"

    # 手動設定はスキップ
    if [[ "$mr_url" == "manual" || -z "$mr_url" ]]; then
      log_info "${svc}: 手動設定 — スキップ"
      skipped=$((skipped + 1))
      continue
    fi

    # MR URLからプロジェクトとIIDを解析
    local project_path mr_iid
    project_path="$(echo "$mr_url" | sed -E 's|https?://[^/]+/(.+)/-/merge_requests/[0-9]+.*|\1|')"
    mr_iid="$(echo "$mr_url" | sed -E 's|.*/merge_requests/([0-9]+).*|\1|')"

    if [[ -z "$project_path" || -z "$mr_iid" || ! "$mr_iid" =~ ^[0-9]+$ ]]; then
      log_warn "${svc}: MR URL解析失敗 — スキップ"
      skipped=$((skipped + 1))
      continue
    fi

    # MR最新情報を取得
    local encoded_project mr_json
    encoded_project="${project_path//\//%2F}"
    mr_json="$(glab api "/projects/${encoded_project}/merge_requests/${mr_iid}" 2>/dev/null)" || {
      log_warn "${svc}: MR情報の取得失敗 — スキップ"
      skipped=$((skipped + 1))
      continue
    }

    local latest_sha pipeline_status mr_author
    latest_sha="$(echo "$mr_json" | jq -r '.sha')"
    pipeline_status="$(echo "$mr_json" | jq -r '.head_pipeline.status // .pipeline.status // "unknown"')"
    mr_author="$(echo "$mr_json" | jq -r '.author.username // empty')"

    local latest_tag
    latest_tag="$(make_image_tag "$latest_sha")"

    # 変更なしチェック
    if [[ "$latest_tag" == "$current_override_tag" ]]; then
      log_info "${svc}: 最新（${current_override_tag:0:20}...）"
      up_to_date=$((up_to_date + 1))
      continue
    fi

    # パイプライン確認
    local pipeline_web_url
    pipeline_web_url="$(echo "$mr_json" | jq -r '.head_pipeline.web_url // .pipeline.web_url // empty')"
    if ! check_pipeline_deployable "$svc" "$pipeline_status" "$pipeline_web_url"; then
      skipped=$((skipped + 1))
      continue
    fi

    log_success "${svc}: 新コミット検出 ${current_override_tag:0:16}... → ${latest_tag:0:16}..."
    deploy_plan+=("${svc}|${SERVICE_NAMESPACE[$svc]}|${latest_tag}|${mr_url}|${mr_author}|${ticket}")
  done

  if [[ $up_to_date -gt 0 ]]; then
    log_info "${up_to_date} 件は最新コミットで稼働中"
  fi
  if [[ $skipped -gt 0 ]]; then
    log_info "${skipped} 件をスキップ"
  fi

  if [[ ${#deploy_plan[@]} -eq 0 ]]; then
    log_success "全サービス最新です — 更新不要"
    return 0
  fi

  # デプロイ計画表示
  print_header "更新計画 (${#deploy_plan[@]} サービス)"
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag url author entry_ticket <<< "$entry"
    log_info "  ${svc}: → ${tag:0:20}..."
  done
  echo ""

  if $DRY_RUN; then
    log_info "[DRY-RUN] ここで終了します"
    return 0
  fi

  if ! confirm "上記のサービスを最新コミットに更新しますか？"; then
    log_info "キャンセルしました"
    return 0
  fi

  # デプロイ実行
  print_header "更新実行"
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag url author entry_ticket <<< "$entry"
    local ecr_repo="${SERVICE_ECR_REPO[$svc]}"
    local full_image
    full_image="$(make_full_image "$ecr_repo" "$tag")"

    local current_tag
    current_tag="$(get_current_image_tag "$svc" "$ns")" || current_tag="latest"

    log_info "${svc}: 更新中..."
    if set_deployment_image "$svc" "$ns" "$full_image"; then
      update_configmap_override "$svc" "$entry_ticket" "$tag" "$current_tag" "$url" "$author" "$TTL_HOURS"
      log_success "${svc}: 更新完了"
    else
      log_error "${svc}: 更新に失敗しました"
    fi
  done

  # rollout待機
  print_header "Rollout Status"
  for entry in "${deploy_plan[@]}"; do
    IFS='|' read -r svc ns tag url author entry_ticket <<< "$entry"
    log_info "${svc}: rollout を待機中..."
    if wait_rollout "$svc" "$ns" "$ROLLOUT_TIMEOUT"; then
      log_success "${svc}: rollout 完了"
    else
      log_warn "${svc}: rollout がタイムアウトしました"
      log_info "  確認: kubectl get pods -n ${ns}"
    fi
  done

  echo ""
  log_success "更新完了"
}

# ======================================================
# メインパーサー
# ======================================================
main() {
  if [[ $# -eq 0 ]]; then
    show_help
    exit 0
  fi

  # グローバルオプションをパース
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=true; shift ;;
      --force)   FORCE=true; shift ;;
      --ttl)
        if [[ ! "$2" =~ ^[0-9]+$ ]] || [[ "$2" -lt 1 ]] || [[ "$2" -gt 168 ]]; then
          log_error "TTLは1〜168の整数で指定してください: $2"
          exit 1
        fi
        TTL_HOURS="$2"; shift 2 ;;
      --help|-h) show_help; exit 0 ;;
      *)         args+=("$1"); shift ;;
    esac
  done

  if [[ ${#args[@]} -eq 0 ]]; then
    show_help
    exit 0
  fi

  local subcmd="${args[0]}"

  case "$subcmd" in
    update)
      cmd_update
      ;;
    diff)
      cmd_diff
      ;;
    status)
      cmd_status
      ;;
    reset)
      if [[ ${#args[@]} -lt 2 ]]; then
        log_error "Usage: kube-deploy reset <TICKET|SERVICE|--mine>"
        exit 1
      fi
      cmd_reset "${args[1]}"
      ;;
    set)
      if [[ ${#args[@]} -lt 2 ]]; then
        log_error "Usage: kube-deploy set <SERVICE> --tag <TAG>"
        exit 1
      fi
      cmd_set "${args[@]:1}"
      ;;
    sync)
      argocd_sync "${args[1]:-}"
      ;;
    restart)
      argocd_restart "${args[1]:-}"
      ;;
    *)
      if [[ "$subcmd" =~ ^https?://.*merge_requests/[0-9]+ ]]; then
        # MR URL
        cmd_deploy_mr_url "$subcmd"
      elif [[ "$subcmd" =~ ^[A-Z]+-[0-9]+$ ]]; then
        # チケット番号
        cmd_deploy_ticket "$subcmd"
      else
        log_error "不明なコマンド: ${subcmd}"
        show_help
        exit 1
      fi
      ;;
  esac
}

# --- クリーンアップ ---
cleanup() {
  argocd_cleanup
}
trap cleanup EXIT

main "$@"
