#!/bin/bash
# kube-deploy インストーラー（Go版）
# go build でバイナリをビルドして /usr/local/bin/kube-deploy にインストール

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_PATH="/usr/local/bin/kube-deploy"

echo -e "${GREEN}${BOLD}"
echo "╔═══════════════════════════════════╗"
echo "║   kube-deploy インストーラー      ║"
echo "╚═══════════════════════════════════╝"
echo -e "${NC}"

# Go チェック
echo -e "${CYAN}[1/3] 前提条件を確認中...${NC}"
if ! command -v go &>/dev/null; then
  echo -e "  ${RED}✗${NC} go がインストールされていません"
  echo "  インストール: https://go.dev/dl/"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} go $(go version | awk '{print $3}')"

for cmd in aws kubectl; do
  if command -v "$cmd" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $cmd"
  else
    echo -e "  ${YELLOW}△${NC} $cmd （未インストール — 一部機能が制限されます）"
  fi
done

# ビルド
echo -e "${CYAN}[2/3] バイナリをビルド中...${NC}"
go build -o /tmp/kube-deploy-build "${SCRIPT_DIR}/cmd/kube-deploy"
echo -e "  ${GREEN}✓${NC} ビルド完了"

# インストール
echo -e "${CYAN}[3/3] インストール中...${NC}"
if [[ -f "$INSTALL_PATH" || -L "$INSTALL_PATH" ]]; then
  sudo mv /tmp/kube-deploy-build "$INSTALL_PATH"
  echo -e "  ${GREEN}✓${NC} 更新完了: ${INSTALL_PATH}"
else
  sudo mv /tmp/kube-deploy-build "$INSTALL_PATH"
  echo -e "  ${GREEN}✓${NC} インストール完了: ${INSTALL_PATH}"
fi
sudo chmod +x "$INSTALL_PATH"

# 完了
echo ""
echo -e "${GREEN}${BOLD}インストール完了${NC}"
echo ""
echo -e "${CYAN}使い方:${NC}"
echo "  kube-deploy TICKET-123         # チケット番号でデプロイ"
echo "  kube-deploy status             # 状態確認"
echo "  kube-deploy reset TICKET-123   # リセット"
echo "  kube-deploy --help             # ヘルプ"
echo ""
echo -e "${CYAN}環境変数（任意）:${NC}"
echo "  export KUBE_DEPLOY_ECR_REGISTRY=123456789012.dkr.ecr.ap-northeast-1.amazonaws.com"
echo "  export KUBE_DEPLOY_GITLAB_HOST=gitlab.example.com"
echo "  export KUBE_DEPLOY_KUBE_CONTEXT=my-dev-cluster"
echo "  export KUBE_DEPLOY_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/..."
echo ""
echo -e "${CYAN}CronJob（任意）:${NC}"
echo "  kubectl apply -f ${SCRIPT_DIR}/cronjob/kube-deploy-ttl-reset.yaml"
echo ""
