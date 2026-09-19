#!/usr/bin/env bash
# lib/ecr.sh — ECR イメージ確認

# AWS認証チェック
check_aws_auth() {
  if ! command -v aws &>/dev/null; then
    log_error "AWS CLI がインストールされていません"
    log_info "インストール: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    return 1
  fi
  if ! aws sts get-caller-identity &>/dev/null; then
    log_error "AWS credentials が無効です"
    log_info "認証: aws sso login"
    return 1
  fi
}

# ECR にイメージが存在するか確認
# $1=ECRリポジトリ名（例: myapp/api-server）
# $2=タグ（例: dev-abc123...）
ecr_image_exists() {
  local repo="$1" tag="$2"
  aws ecr describe-images \
    --repository-name "$repo" \
    --image-ids imageTag="$tag" \
    --region "${KUBE_DEPLOY_AWS_REGION:-ap-northeast-1}" \
    --output json &>/dev/null
}

# コミットSHAからイメージタグを生成
# $1=full commit SHA (40文字)
make_image_tag() {
  echo "dev-${1}"
}

# フルイメージURIを生成
# $1=ECRリポジトリ名, $2=タグ
make_full_image() {
  echo "${ECR_REGISTRY}/${1}:${2}"
}
