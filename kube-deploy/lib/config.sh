#!/usr/bin/env bash
# lib/config.sh — サービスマッピング、定数
# shellcheck disable=SC2034  # 変数はsource元で使用

# --- 定数 ---
# 環境変数で上書き可能
ECR_REGISTRY="${KUBE_DEPLOY_ECR_REGISTRY:-123456789012.dkr.ecr.ap-northeast-1.amazonaws.com}"
CONFIGMAP_NAME="${KUBE_DEPLOY_CONFIGMAP_NAME:-kube-deploy-image-overrides}"
CONFIGMAP_NS="${KUBE_DEPLOY_CONFIGMAP_NS:-default}"
DEFAULT_TTL_HOURS="${KUBE_DEPLOY_DEFAULT_TTL_HOURS:-24}"
ROLLOUT_TIMEOUT="${KUBE_DEPLOY_ROLLOUT_TIMEOUT:-120s}"
GITLAB_GROUP="${KUBE_DEPLOY_GITLAB_GROUP:-myorg%2Fapplication}"
GITLAB_PER_PAGE=100

# Kubernetes コンテキスト（カンマ区切りで複数指定可能）
# 例: export KUBE_DEPLOY_KUBE_CONTEXTS="my-dev,arn:aws:eks:..."
_KUBE_CONTEXTS_RAW="${KUBE_DEPLOY_KUBE_CONTEXTS:-my-dev-context}"
IFS=',' read -ra KUBE_CONTEXTS <<< "$_KUBE_CONTEXTS_RAW"

# --- サービス → namespace マッピング ---
# 使用環境に合わせて変更してください
declare -A SERVICE_NAMESPACE=(
  [api-server]="backend"
  [web-frontend]="frontend"
  [worker]="backend"
  [scheduler]="backend"
)

# --- サービス → ECR リポジトリ名 マッピング ---
declare -A SERVICE_ECR_REPO=(
  [api-server]="myapp/api-server"
  [web-frontend]="myapp/web-frontend"
  [worker]="myapp/worker"
  [scheduler]="myapp/scheduler"
)

# --- サービス → GitLab プロジェクトパス マッピング ---
declare -A SERVICE_GITLAB_PROJECT=(
  [api-server]="myorg/application/api-server"
  [web-frontend]="myorg/application/web-frontend"
  [worker]="myorg/application/worker"
  [scheduler]="myorg/application/scheduler"
)

# --- GitLab プロジェクトパス → サービス名 逆引き ---
declare -A GITLAB_TO_SERVICE=()
for svc in "${!SERVICE_GITLAB_PROJECT[@]}"; do
  GITLAB_TO_SERVICE["${SERVICE_GITLAB_PROJECT[$svc]}"]="$svc"
done

# サービス名のバリデーション
is_valid_service() {
  [[ -n "${SERVICE_NAMESPACE[$1]+_}" ]]
}

# 全サービス名一覧
list_services() {
  for svc in "${!SERVICE_NAMESPACE[@]}"; do
    echo "$svc"
  done | sort
}
