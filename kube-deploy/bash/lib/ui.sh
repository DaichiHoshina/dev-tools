#!/usr/bin/env bash
# lib/ui.sh — 色出力、ログ関数、テーブル表示

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# 確認プロンプト（y/N）
confirm() {
  local message="${1:-続行しますか？}"
  echo -en "${YELLOW}${message} (y/N): ${NC}"
  read -r reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# セクションヘッダー表示
print_header() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# テーブル表示（タブ区切り入力）
# 使い方: echo -e "col1\tcol2\nval1\tval2" | print_table
print_table() {
  column -t -s $'\t'
}

# デプロイ計画をテーブル表示
print_deploy_plan() {
  local -n _plan=$1
  print_header "デプロイ計画"
  printf "${BOLD}%-28s %-12s %-44s %s${NC}\n" "サービス" "namespace" "イメージタグ" "MR"
  printf "%-28s %-12s %-44s %s\n" "---" "---" "---" "---"
  for entry in "${_plan[@]}"; do
    IFS='|' read -r svc ns tag mr_url <<< "$entry"
    printf "%-28s %-12s %-44s %s\n" "$svc" "$ns" "$tag" "$mr_url"
  done
  echo ""
}

# ステータス表示用の色付きバッジ
badge_override() { echo -e "${YELLOW}OVERRIDE${NC}"; }
badge_default()  { echo -e "${GREEN}DEFAULT${NC}"; }
