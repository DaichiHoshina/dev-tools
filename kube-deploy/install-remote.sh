#!/bin/bash
# kube-deploy リモートインストーラー
# curl -fsSL https://raw.githubusercontent.com/user/dev-tools/main/kube-deploy/install-remote.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BINARY_NAME="kube-deploy"
INSTALL_DIR="/usr/local/bin"

echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════╗"
echo "║   kube-deploy リモートインストーラー ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# [1/3] OS/アーキテクチャ検出
echo -e "${CYAN}[1/3] OS/アーキテクチャを検出中...${NC}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)
    echo -e "  ${RED}✗${NC} 未対応のアーキテクチャ: ${ARCH}"
    exit 1
    ;;
esac

case "$OS" in
  darwin|linux) ;;
  *)
    echo -e "  ${RED}✗${NC} 未対応のOS: ${OS}"
    exit 1
    ;;
esac

ASSET_NAME="${BINARY_NAME}-${OS}-${ARCH}"
echo -e "  ${GREEN}✓${NC} ${OS}/${ARCH} (${ASSET_NAME})"

# [2/3] ダウンロード
echo -e "${CYAN}[2/3] バイナリをダウンロード中...${NC}"

# リリースURLを環境変数で上書き可能
DOWNLOAD_URL="${KUBE_DEPLOY_DOWNLOAD_URL:-}"

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo -e "  ${YELLOW}△${NC} KUBE_DEPLOY_DOWNLOAD_URL が設定されていません"
  echo -e "  ローカルビルドを行う場合は install.sh を使用してください"
  exit 1
fi

TMPDIR_PATH="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PATH"' EXIT

curl -fsSL -o "${TMPDIR_PATH}/${BINARY_NAME}" "$DOWNLOAD_URL"
chmod +x "${TMPDIR_PATH}/${BINARY_NAME}"
echo -e "  ${GREEN}✓${NC} ダウンロード完了"

# [3/3] インストール
echo -e "${CYAN}[3/3] ${INSTALL_DIR}/${BINARY_NAME} にインストール中...${NC}"

if [[ -w "$INSTALL_DIR" ]]; then
  mv "${TMPDIR_PATH}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
else
  sudo mv "${TMPDIR_PATH}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
fi

echo -e "  ${GREEN}✓${NC} ${INSTALL_DIR}/${BINARY_NAME} にインストール完了"

# 完了
echo ""
echo -e "${GREEN}${BOLD}インストール完了${NC}"
echo ""
echo -e "${CYAN}バージョン確認:${NC}"
echo "  ${BINARY_NAME} --version"
echo ""
echo -e "${CYAN}使い方:${NC}"
echo "  ${BINARY_NAME} TICKET-123         # チケット番号でデプロイ"
echo "  ${BINARY_NAME} status             # 状態確認"
echo "  ${BINARY_NAME} reset TICKET-123   # リセット"
echo "  ${BINARY_NAME} --help             # ヘルプ"
