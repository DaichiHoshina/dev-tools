#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source API libs for tag comparison
source "${SCRIPT_DIR}/lib/gitlab-api.sh"

# List all services defined in release-config.yaml (comma-separated)
# Override via ALL_SERVICES env var or update to match your config
ALL_SERVICES="${ALL_SERVICES:-api-server,web-frontend,worker}"

# Check if a service has TES↔target env tag difference
has_tag_diff() {
  local svc="$1"
  local target_env="$2"
  (
    source "${SCRIPT_DIR}/lib/config.sh"
    export SERVICE_NAME="$svc"
    config::resolve_service
    config::load_service

    local tes_path="environments/tes/values/${SVC_VALUES_FILE}"
    local target_path="environments/${target_env}/values/${SVC_VALUES_FILE}"

    local tes_content target_content tes_tag target_tag
    tes_content="$(gl::get_file "$INFRA_PROJECT_PATH" "$tes_path" "master" 2>/dev/null)" || exit 1
    target_content="$(gl::get_file "$INFRA_PROJECT_PATH" "$target_path" "master" 2>/dev/null)" || exit 1

    tes_tag="$(echo "$tes_content" | grep -E '^\s*tag:' | head -1 | sed -E "s/.*tag:\s*[\"']?([^\"'[:space:]]+)[\"']?.*/\1/")"
    target_tag="$(echo "$target_content" | grep -E '^\s*tag:' | head -1 | sed -E "s/.*tag:\s*[\"']?([^\"'[:space:]]+)[\"']?.*/\1/")"

    [[ "$tes_tag" != "$target_tag" ]]
  )
}

# --- Parse TARGET ---
IFS=',' read -ra TARGET_ENVS <<< "${TARGET:-}"

if (( ${#TARGET_ENVS[@]} == 0 )); then
  echo "[ERROR] TARGET が未設定です" >&2
  exit 1
fi

# Trim whitespace, skip tes, validate
FILTERED_ENVS=()
for i in "${!TARGET_ENVS[@]}"; do
  TARGET_ENVS[$i]="$(echo "${TARGET_ENVS[$i]}" | tr -d ' ')"
  [[ "${TARGET_ENVS[$i]}" == "tes" ]] && continue
  if [[ "${TARGET_ENVS[$i]}" != "stg" && "${TARGET_ENVS[$i]}" != "prd" ]]; then
    echo "[ERROR] 不正なTARGET: ${TARGET_ENVS[$i]} (tes, stg, prd)" >&2
    exit 1
  fi
  FILTERED_ENVS+=("${TARGET_ENVS[$i]}")
done
TARGET_ENVS=("${FILTERED_ENVS[@]}")

if (( ${#TARGET_ENVS[@]} == 0 )); then
  echo "昇格対象の環境がありません。"
  exit 0
fi

# --- Parse SERVICE_NAME ---
input="${SERVICE_NAME:-}"

if [[ -z "$input" ]]; then
  echo "[ERROR] SERVICE_NAME が未設定です" >&2
  exit 1
fi

is_all=false
if [[ "$input" == "all" ]]; then
  is_all=true
  input="$ALL_SERVICES"
fi

IFS=',' read -ra SERVICES <<< "$input"

for i in "${!SERVICES[@]}"; do
  SERVICES[$i]="$(echo "${SERVICES[$i]}" | tr -d ' ')"
done

# --- Build job list: (env, service) pairs ---
declare -a JOBS=()

for env in "${TARGET_ENVS[@]}"; do
  local_env_upper="$(echo "$env" | tr '[:lower:]' '[:upper:]')"

  if $is_all; then
    echo "=============================================="
    echo " TES ↔ ${local_env_upper} タグ差分チェック中..."
    echo "=============================================="

    for svc in "${SERVICES[@]}"; do
      if has_tag_diff "$svc" "$env"; then
        echo " [差分あり] ${svc}"
        JOBS+=("${env}:${svc}")
      else
        echo " [同一]     ${svc}"
      fi
    done
    echo ""
  else
    for svc in "${SERVICES[@]}"; do
      JOBS+=("${env}:${svc}")
    done
  fi
done

if (( ${#JOBS[@]} == 0 )); then
  echo "昇格対象のサービスがありません。全サービスが最新です。"
  exit 0
fi

echo "昇格対象: ${#JOBS[@]}件"
for job in "${JOBS[@]}"; do
  echo "  ${job}"
done
echo ""

# --- Single job: run directly ---
if (( ${#JOBS[@]} == 1 )); then
  IFS=':' read -r single_env single_svc <<< "${JOBS[0]}"
  export PROMOTE_TARGET_ENV="$single_env"
  export SERVICE_NAME="$single_svc"
  exec bash "${SCRIPT_DIR}/promote-env.sh"
fi

# --- Multiple jobs: parallel promote ---
echo "=============================================="
echo " Promote TES → ${TARGET_ENVS[*]} (Multi)"
echo " JOBS: ${#JOBS[@]}件"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

LOG_DIR="/tmp/promote-logs-$$"
mkdir -p "$LOG_DIR"

promote_start="$(date +%s)"

declare -A pids

for job in "${JOBS[@]}"; do
  IFS=':' read -r job_env job_svc <<< "$job"
  echo "[${job_env}/${job_svc}] 昇格開始..."
  (
    export PROMOTE_TARGET_ENV="$job_env"
    export SERVICE_NAME="$job_svc"
    bash "${SCRIPT_DIR}/promote-env.sh"
  ) > "${LOG_DIR}/${job_env}_${job_svc}.log" 2>&1 &
  pids[$job]=$!
done

echo ""
echo "全 ${#JOBS[@]} ジョブを並列実行中..."
echo ""

declare -A results
failed=0
succeeded=0

for job in "${JOBS[@]}"; do
  if wait "${pids[$job]}" 2>/dev/null; then
    results[$job]="SUCCESS"
    succeeded=$((succeeded + 1))
    echo "[SUCCESS] ${job}"
  else
    results[$job]="FAILED"
    failed=$((failed + 1))
    echo "[FAILED]  ${job}"
  fi
done

promote_end="$(date +%s)"
total_elapsed=$(( promote_end - promote_start ))

# --- Summary ---
echo ""
echo "=============================================="
echo " Multi Promote 結果"
echo "=============================================="
echo " 成功: ${succeeded}/${#JOBS[@]}"
echo " 失敗: ${failed}/${#JOBS[@]}"
echo " 所要時間: ${total_elapsed}秒"
echo ""

for job in "${JOBS[@]}"; do
  if [[ "${results[$job]}" == "SUCCESS" ]]; then
    echo " [OK]   ${job}"
  else
    echo " [FAIL] ${job}"
  fi
done
echo "=============================================="
echo ""
echo "作成されたMRをレビュー・承認後にマージしてください。"

# Print failed logs
if (( failed > 0 )); then
  echo ""
  echo "=============================================="
  echo " 失敗ジョブのログ"
  echo "=============================================="
  for job in "${JOBS[@]}"; do
    if [[ "${results[$job]}" == "FAILED" ]]; then
      IFS=':' read -r job_env job_svc <<< "$job"
      echo ""
      echo "--- ${job} ---"
      tail -50 "${LOG_DIR}/${job_env}_${job_svc}.log"
      echo "--- /${job} ---"
    fi
  done
fi

rm -rf "$LOG_DIR"

if (( failed > 0 )); then
  exit 1
fi
