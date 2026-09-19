#!/bin/bash
# kube-deploy インストーラー（Bash版）
# /usr/local/bin/kube-deploy にシンボリックリンクを作成

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SCRIPT="${SCRIPT_DIR}/kube-deploy.sh"
INSTALL_PATH="/usr/local/bin/kube-deploy"

echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   kube-deploy インストーラー（Bash版）║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# 前提条件チェック
echo -e "${CYAN}[1/3] 前提条件を確認中...${NC}"
has_error=false
for cmd in glab aws kubectl jq; do
  if command -v "$cmd" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $cmd"
  else
    echo -e "  ${RED}✗${NC} $cmd （未インストール）"
    has_error=true
  fi
done

if $has_error; then
  echo -e "${YELLOW}警告: 一部のコマンドが見つかりません。使用前にインストールしてください${NC}"
fi

# Bashバージョンチェック
bash_ver="$(/opt/homebrew/bin/bash --version 2>/dev/null | head -1 || bash --version | head -1)"
echo -e "  ${GREEN}✓${NC} bash: ${bash_ver}"

# 実行権限設定
echo -e "${CYAN}[2/3] 実行権限を設定中...${NC}"
chmod +x "${MAIN_SCRIPT}"
chmod +x "${SCRIPT_DIR}/lib/"*.sh
echo -e "  ${GREEN}✓${NC} 権限設定完了"

# シンボリックリンク作成
echo -e "${CYAN}[3/3] シンボリックリンクを作成中...${NC}"
if [[ -L "$INSTALL_PATH" ]]; then
  current_target="$(readlink "$INSTALL_PATH")"
  if [[ "$current_target" == "$MAIN_SCRIPT" ]]; then
    echo -e "  ${GREEN}✓${NC} 既にインストール済み: ${INSTALL_PATH} → ${MAIN_SCRIPT}"
  else
    echo -e "  ${YELLOW}既存のリンクを更新します${NC}"
    echo -e "  旧: ${current_target}"
    echo -e "  新: ${MAIN_SCRIPT}"
    sudo ln -sf "$MAIN_SCRIPT" "$INSTALL_PATH"
    echo -e "  ${GREEN}✓${NC} 更新完了"
  fi
elif [[ -f "$INSTALL_PATH" ]]; then
  echo -e "  ${RED}${INSTALL_PATH} はファイルとして既に存在します${NC}"
  echo -e "  手動で削除してから再実行してください: sudo rm ${INSTALL_PATH}"
  exit 1
else
  sudo ln -s "$MAIN_SCRIPT" "$INSTALL_PATH"
  echo -e "  ${GREEN}✓${NC} ${INSTALL_PATH} → ${MAIN_SCRIPT}"
fi

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
echo "  export KUBE_DEPLOY_KUBE_CONTEXT=my-dev-context"
echo "  export KUBE_DEPLOY_GITLAB_GROUP=myorg%2Fapplication"
echo "  export KUBE_DEPLOY_APP_PREFIX=myapp-dev"
echo ""
echo -e "${CYAN}CronJob（任意）:${NC}"
echo "  kubectl apply -f ${SCRIPT_DIR}/cronjob/kube-deploy-ttl-reset.yaml"
echo ""
