#!/bin/bash
# kube-deploy リモートインストーラー（Bash版）
# curl -fsSL <URL>/install-remote.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/usr/local/lib/kube-deploy-bash"
LINK_PATH="/usr/local/bin/kube-deploy"

echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║   kube-deploy リモートインストーラー     ║"
echo "║   （Bash版）                             ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ダウンロードURLが設定されていることを確認
echo -e "${CYAN}[1/3] ダウンロードURLを確認中...${NC}"
DOWNLOAD_URL="${KUBE_DEPLOY_DOWNLOAD_URL:-}"

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo -e "  ${RED}✗${NC} KUBE_DEPLOY_DOWNLOAD_URL が設定されていません"
  echo ""
  echo -e "  ${YELLOW}使い方:${NC}"
  echo '  KUBE_DEPLOY_DOWNLOAD_URL="https://example.com/kube-deploy-bash.tar.gz" bash -c "$(curl -fsSL ...)"'
  exit 1
fi
echo -e "  ${GREEN}✓${NC} URL確認済み"

# [2/3] tar.gzをダウンロードして展開
echo -e "${CYAN}[2/3] ダウンロード・展開中...${NC}"

TMPDIR_PATH="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PATH"' EXIT

curl -fsSL -o "${TMPDIR_PATH}/kube-deploy-bash.tar.gz" "$DOWNLOAD_URL"
tar xzf "${TMPDIR_PATH}/kube-deploy-bash.tar.gz" -C "${TMPDIR_PATH}"
echo -e "  ${GREEN}✓${NC} ダウンロード・展開完了"

# [3/3] インストール
echo -e "${CYAN}[3/3] ${INSTALL_DIR} にインストール中...${NC}"

# インストール先ディレクトリ作成
if [[ -w "$(dirname "$INSTALL_DIR")" ]]; then
  mkdir -p "$INSTALL_DIR"
  cp -r "${TMPDIR_PATH}/kube-deploy.sh" "${TMPDIR_PATH}/lib" "$INSTALL_DIR/"
else
  sudo mkdir -p "$INSTALL_DIR"
  sudo cp -r "${TMPDIR_PATH}/kube-deploy.sh" "${TMPDIR_PATH}/lib" "$INSTALL_DIR/"
fi

# 実行権限設定
if [[ -w "$INSTALL_DIR" ]]; then
  chmod +x "${INSTALL_DIR}/kube-deploy.sh"
  chmod +x "${INSTALL_DIR}/lib/"*.sh
else
  sudo chmod +x "${INSTALL_DIR}/kube-deploy.sh"
  sudo chmod +x "${INSTALL_DIR}/lib/"*.sh
fi

# シンボリックリンク作成
if [[ -w "$(dirname "$LINK_PATH")" ]]; then
  ln -sf "${INSTALL_DIR}/kube-deploy.sh" "$LINK_PATH"
else
  sudo ln -sf "${INSTALL_DIR}/kube-deploy.sh" "$LINK_PATH"
fi

echo -e "  ${GREEN}✓${NC} ${LINK_PATH} → ${INSTALL_DIR}/kube-deploy.sh"

# 完了
echo ""
echo -e "${GREEN}${BOLD}インストール完了${NC}"
echo ""
echo -e "${CYAN}使い方:${NC}"
echo "  kube-deploy TICKET-123         # チケット番号でデプロイ"
echo "  kube-deploy status             # 状態確認"
echo "  kube-deploy reset TICKET-123   # リセット"
echo "  kube-deploy --help             # ヘルプ"
