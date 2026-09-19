#!/usr/bin/env bash
# Config loading and validation
# Reads release-config.yaml and resolves service names

# Infrastructure repository path (e.g. your-org/infrastructure/helm/application)
INFRA_PROJECT_PATH="${INFRA_PROJECT_PATH:-your-org/infrastructure/helm/application}"

# App repository group prefix (e.g. your-org)
APP_PROJECT_GROUP="${APP_PROJECT_GROUP:-your-org}"

# Resolved values (set by config::load_service)
SVC_APP_REPO=""
SVC_VALUES_FILE=""
SVC_ARGOCD_APP=""
SVC_PRD_ARGOCD_APP=""
SVC_NAMESPACE=""
SVC_TAG_PREFIX=""
SVC_CONFIG_KEY=""
APP_PROJECT_PATH=""
TAG_NAME=""

config::validate() {
  if [[ -z "${SERVICE_NAME:-}" ]]; then
    log::error "SERVICE_NAME が未設定です"
    echo ""
    echo "使い方: GitLab CI/CD → Run Pipeline で以下の変数を設定してください"
    echo "  SERVICE_NAME: サービス名 (例: api-server, web-frontend, worker)"
    echo "  VERSION: バージョン (例: 1.2.3)。空欄なら自動インクリメント"
    echo ""
    echo "利用可能なサービス: release-config.yaml の services キーを参照してください"
    exit 1
  fi

  # "auto" は空と同等（自動計算）
  if [[ "${VERSION:-}" == "auto" ]]; then
    VERSION=""
  fi

  # VERSION が空の場合は後で自動取得するので、ここではスキップ
  if [[ -n "${VERSION:-}" ]]; then
    if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      log::error "VERSION の形式が不正です: ${VERSION} (期待: X.Y.Z)"
      exit 1
    fi
  fi
}

config::auto_version() {
  if [[ -n "${VERSION:-}" ]]; then
    return 0
  fi

  log::info "VERSION 未指定。スプリントベースで自動計算します..."

  # --- スプリントマイナーバージョン計算 ---
  # 基準日と初期マイナーバージョンは環境変数で設定可能
  # SPRINT_BASE_DATE: 基準日 (例: "2026-01-29 16:00:00")
  # SPRINT_BASE_MINOR: 基準日のマイナーバージョン (例: 1)
  # SPRINT_MAJOR: メジャーバージョン (例: 1)
  local sprint_base_date="${SPRINT_BASE_DATE:-2026-01-01 00:00:00}"
  local sprint_base_minor="${SPRINT_BASE_MINOR:-1}"
  local sprint_major="${SPRINT_MAJOR:-1}"

  local base_epoch
  base_epoch="$(TZ=UTC date -d "${sprint_base_date}" +%s 2>/dev/null || date -jf '%Y-%m-%d %H:%M:%S' "${sprint_base_date}" +%s 2>/dev/null || echo 1767225600)"
  local now_epoch
  now_epoch="$(date +%s)"
  local diff_seconds=$(( now_epoch - base_epoch ))
  local weeks=$(( diff_seconds / (7 * 24 * 60 * 60) ))
  if (( weeks < 0 )); then weeks=0; fi
  local auto_minor=$(( sprint_base_minor + weeks ))

  log::info "スプリントマイナー: ${auto_minor} (基準: ${sprint_base_date} + ${weeks}週)"

  # --- 最新タグ取得 ---
  local project_encoded
  project_encoded="$(jq -rn --arg p "$APP_PROJECT_PATH" '$p | @uri')"

  local tags_json
  tags_json="$(gl::request GET "/projects/${project_encoded}/repository/tags?order_by=updated&sort=desc&per_page=10" "$APP_PROJECT_PATH")"

  local latest_tag
  latest_tag="$(echo "$tags_json" | jq -r --arg prefix "$SVC_TAG_PREFIX" '[.[] | select(.name | startswith($prefix))] | first | .name // empty')"

  # --- ビルド番号（パッチ）計算 ---
  local auto_build=0

  if [[ -n "$latest_tag" ]]; then
    log::info "最新タグ: ${latest_tag}"
    local version_part="${latest_tag#"$SVC_TAG_PREFIX"}"

    if [[ "$version_part" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
      local current_minor="${BASH_REMATCH[2]}"
      local current_build="${BASH_REMATCH[3]}"

      if (( current_minor == auto_minor )); then
        # 同じマイナー → ビルド+1
        auto_build=$(( current_build + 1 ))
      else
        # マイナーが変わった → ビルド0にリセット
        auto_build=0
      fi
    fi
  else
    log::warning "タグが見つかりません (prefix=${SVC_TAG_PREFIX})。ビルド番号は0で開始"
  fi

  VERSION="${sprint_major}.${auto_minor}.${auto_build}"
  TAG_NAME="${SVC_TAG_PREFIX}${VERSION}"

  log::success "自動バージョン: ${latest_tag:-なし} → ${TAG_NAME}"
}

config::validate_promote() {
  if [[ -z "${SERVICE_NAME:-}" ]]; then
    log::error "SERVICE_NAME が未設定です"
    echo ""
    echo "使い方: GitLab CI/CD → Run Pipeline で以下の変数を設定してください"
    echo "  PROMOTE_PRD: true"
    echo "  SERVICE_NAME: サービス名 (例: api-server, web-frontend, worker)"
    echo ""
    echo "利用可能なサービス: release-config.yaml の services キーを参照してください"
    exit 1
  fi
}

config::resolve_service() {
  # Directly use SERVICE_NAME as the config key
  # (allows any service name defined in release-config.yaml)
  SVC_CONFIG_KEY="$SERVICE_NAME"
  log::info "サービス解決: ${SERVICE_NAME} → ${SVC_CONFIG_KEY}"
}

config::load_service() {
  local config_file="${SCRIPT_DIR}/../config/release-config.yaml"

  if [[ ! -f "$config_file" ]]; then
    log::error "release-config.yaml が見つかりません: ${config_file}"
    exit 1
  fi

  # Simple YAML parser for our flat structure
  # Finds the service block and extracts key-value pairs
  local in_service=false

  while IFS= read -r line; do
    # Match "  service-name:" (2-space indent, our service key)
    if [[ "$line" =~ ^"  ${SVC_CONFIG_KEY}:" ]]; then
      in_service=true
      continue
    fi

    if $in_service; then
      # End of service block: line with 2-space indent (next service) or less
      if [[ "$line" =~ ^[[:space:]]{0,2}[^[:space:]] && ! "$line" =~ ^[[:space:]]{4} ]]; then
        break
      fi

      # Extract key-value (4-space indent)
      if [[ "$line" =~ ^[[:space:]]{4}([a-z_]+):[[:space:]]*(.*) ]]; then
        local key="${BASH_REMATCH[1]}"
        local value="${BASH_REMATCH[2]}"
        case "$key" in
          app_repo)    SVC_APP_REPO="$value" ;;
          values_file) SVC_VALUES_FILE="$value" ;;
          argocd_app)      SVC_ARGOCD_APP="$value" ;;
          prd_argocd_app)  SVC_PRD_ARGOCD_APP="$value" ;;
          namespace)       SVC_NAMESPACE="$value" ;;
          tag_prefix)      SVC_TAG_PREFIX="$value" ;;
        esac
      fi
    fi
  done < "$config_file"

  if [[ -z "$SVC_APP_REPO" ]]; then
    log::error "サービス '${SVC_CONFIG_KEY}' が release-config.yaml に見つかりません"
    exit 1
  fi

  APP_PROJECT_PATH="${SVC_APP_REPO}"
  TAG_NAME="${SVC_TAG_PREFIX}${VERSION:-}"

  log::info "設定読み込み完了:"
  log::info "  app_repo:        ${SVC_APP_REPO}"
  log::info "  project:         ${APP_PROJECT_PATH}"
  log::info "  tag:             ${TAG_NAME}"
  log::info "  values_file:     ${SVC_VALUES_FILE}"
  log::info "  argocd_app:      ${SVC_ARGOCD_APP}"
  log::info "  prd_argocd_app:  ${SVC_PRD_ARGOCD_APP}"
}
