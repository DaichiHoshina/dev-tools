#!/usr/bin/env bash
# GitLab REST API curl wrapper functions
# Usage: source this file, then call gl::* functions

GITLAB_BASE_URL="${GITLAB_BASE_URL:-https://gitlab.example.com}"
GITLAB_API_VERSION="v4"

# --- Token selection ---

gl::_token_for_project() {
  local project_path="$1"
  if [[ "$project_path" == *infrastructure* ]]; then
    echo "${INFRA_GITLAB_TOKEN:?INFRA_GITLAB_TOKEN is not set}"
  else
    echo "${DEPLOY_GITLAB_TOKEN:?DEPLOY_GITLAB_TOKEN is not set}"
  fi
}

# --- Base request ---

gl::request() {
  local method="$1"
  local endpoint="$2"
  local project_path="${3:-}"
  local body="${4:-}"

  local token
  token="$(gl::_token_for_project "$project_path")"

  local url="${GITLAB_BASE_URL}/api/${GITLAB_API_VERSION}${endpoint}"

  local args=(
    -s -w "\n%{http_code}"
    -H "PRIVATE-TOKEN: ${token}"
    -H "Content-Type: application/json"
    -X "$method"
  )

  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi

  local response
  response="$(curl "${args[@]}" "$url" 2>&1)"

  # Split response body and HTTP status code
  http_code="$(echo "$response" | tail -n1)"
  response="$(echo "$response" | sed '$d')"

  if [[ "$http_code" -ge 400 ]]; then
    echo "[ERROR] HTTP ${http_code}: ${method} ${endpoint}" >&2
    echo "[ERROR] Response: ${response}" >&2
    return 1
  fi

  echo "$response"
}

# --- Merge Requests ---

gl::get_mr() {
  local project_path="$1"
  local mr_iid="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/merge_requests/${mr_iid}" "$project_path"
}

gl::get_mr_changes() {
  local project_path="$1"
  local mr_iid="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/merge_requests/${mr_iid}/changes" "$project_path"
}

gl::find_mrs() {
  local project_path="$1"
  local source_branch="$2"
  local target_branch="$3"
  local state="${4:-all}"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/merge_requests?source_branch=${source_branch}&target_branch=${target_branch}&state=${state}&per_page=5" "$project_path"
}

gl::create_mr() {
  local project_path="$1"
  local source_branch="$2"
  local target_branch="$3"
  local title="$4"
  local description="${5:-}"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local body
  body="$(jq -n \
    --arg sb "$source_branch" \
    --arg tb "$target_branch" \
    --arg t "$title" \
    --arg d "$description" \
    '{source_branch: $sb, target_branch: $tb, title: $t, description: $d, remove_source_branch: true}')"
  gl::request POST "/projects/${encoded}/merge_requests" "$project_path" "$body"
}

gl::approve_mr() {
  local project_path="$1"
  local mr_iid="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request POST "/projects/${encoded}/merge_requests/${mr_iid}/approve" "$project_path"
}

gl::merge_mr() {
  local project_path="$1"
  local mr_iid="$2"
  local remove_source_branch="${3:-true}"
  local mwps="${4:-true}"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local body
  body="$(jq -n \
    --argjson rsb "$remove_source_branch" \
    --argjson mwps "$mwps" \
    '{squash: false, should_remove_source_branch: $rsb, merge_when_pipeline_succeeds: $mwps}')"
  gl::request PUT "/projects/${encoded}/merge_requests/${mr_iid}/merge" "$project_path" "$body"
}

# --- Pipelines ---

gl::get_pipelines() {
  local project_path="$1"
  local ref="$2"
  local per_page="${3:-1}"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/pipelines?ref=$(jq -rn --arg r "$ref" '$r | @uri')&per_page=${per_page}&order_by=id&sort=desc" "$project_path"
}

gl::get_pipeline_status() {
  local project_path="$1"
  local pipeline_id="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/pipelines/${pipeline_id}" "$project_path"
}

# --- Tags ---

gl::create_tag() {
  local project_path="$1"
  local tag_name="$2"
  local ref="$3"
  local message="${4:-}"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local body
  body="$(jq -n \
    --arg tn "$tag_name" \
    --arg r "$ref" \
    --arg m "$message" \
    '{tag_name: $tn, ref: $r, message: $m}')"
  gl::request POST "/projects/${encoded}/repository/tags" "$project_path" "$body"
}

gl::get_tag() {
  local project_path="$1"
  local tag_name="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local tag_encoded
  tag_encoded="$(jq -rn --arg t "$tag_name" '$t | @uri')"
  gl::request GET "/projects/${encoded}/repository/tags/${tag_encoded}" "$project_path"
}

# --- Branches ---

gl::create_branch() {
  local project_path="$1"
  local branch_name="$2"
  local ref="$3"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local body
  body="$(jq -n \
    --arg b "$branch_name" \
    --arg r "$ref" \
    '{branch: $b, ref: $r}')"
  gl::request POST "/projects/${encoded}/repository/branches" "$project_path" "$body"
}

# --- Files ---

gl::get_file() {
  local project_path="$1"
  local file_path="$2"
  local ref="${3:-master}"
  local project_encoded file_encoded
  project_encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  file_encoded="$(jq -rn --arg f "$file_path" '$f | @uri')"
  gl::request GET "/projects/${project_encoded}/repository/files/${file_encoded}/raw?ref=$(jq -rn --arg r "$ref" '$r | @uri')" "$project_path"
}

gl::update_file() {
  local project_path="$1"
  local file_path="$2"
  local branch="$3"
  local content="$4"
  local commit_message="$5"
  local project_encoded file_encoded
  project_encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  file_encoded="$(jq -rn --arg f "$file_path" '$f | @uri')"
  local body
  body="$(jq -n \
    --arg b "$branch" \
    --arg c "$content" \
    --arg m "$commit_message" \
    '{branch: $b, content: $c, commit_message: $m}')"
  gl::request PUT "/projects/${project_encoded}/repository/files/${file_encoded}" "$project_path" "$body"
}

# --- Compare ---

gl::compare() {
  local project_path="$1"
  local from_ref="$2"
  local to_ref="$3"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  local from_encoded to_encoded
  from_encoded="$(jq -rn --arg r "$from_ref" '$r | @uri')"
  to_encoded="$(jq -rn --arg r "$to_ref" '$r | @uri')"
  gl::request GET "/projects/${encoded}/repository/compare?from=${from_encoded}&to=${to_encoded}" "$project_path"
}

gl::get_commit_mrs() {
  local project_path="$1"
  local commit_sha="$2"
  local encoded
  encoded="$(jq -rn --arg p "$project_path" '$p | @uri')"
  gl::request GET "/projects/${encoded}/repository/commits/${commit_sha}/merge_requests" "$project_path"
}

# --- Utility ---

gl::poll_until() {
  local description="$1"
  local check_cmd="$2"
  local interval="${3:-15}"
  local max_wait="${4:-1800}"
  local start_time
  start_time="$(date +%s)"

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if (( elapsed >= max_wait )); then
      log::error "${description} タイムアウト（${max_wait}秒）"
      return 1
    fi

    if eval "$check_cmd"; then
      return 0
    fi

    log::info "${description}... (${elapsed}秒経過)"
    sleep "$interval"
  done
}

# --- Logging ---

log::info()    { echo "[INFO] $(date '+%H:%M:%S') $*"; }
log::success() { echo "[SUCCESS] $(date '+%H:%M:%S') $*"; }
log::warning() { echo "[WARNING] $(date '+%H:%M:%S') $*"; }
log::error()   { echo "[ERROR] $(date '+%H:%M:%S') $*" >&2; }
log::step()    { echo ""; echo "========== $* =========="; }
