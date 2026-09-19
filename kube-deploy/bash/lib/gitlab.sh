#!/usr/bin/env bash
# lib/gitlab.sh — GitLab API（glab経由のMR検索）

# glab 認証チェック
check_glab_auth() {
  if ! command -v glab &>/dev/null; then
    log_error "glab がインストールされていません"
    log_info "インストール: brew install glab"
    return 1
  fi
  if ! glab auth status &>/dev/null; then
    log_error "glab が未認証です"
    log_info "認証: glab auth login --hostname <gitlab_host>"
    return 1
  fi
}

# チケット番号に関連するMRを検索
# $1=チケット番号（例: TICKET-123）
# stdout: JSON配列 [{sha, iid, title, web_url, project_path, pipeline_status, author}, ...]
search_mrs_by_ticket() {
  local ticket="$1"
  local raw_response

  raw_response="$(glab api "/groups/${GITLAB_GROUP}/merge_requests" \
    -X GET \
    -f state=opened \
    -f search="${ticket}" \
    -f per_page="${GITLAB_PER_PAGE}" \
    -f include_subgroups=true 2>/dev/null)" || {
    log_error "GitLab API リクエストに失敗しました"
    return 1
  }

  # ブランチ名またはタイトルにチケット番号を含むMRを抽出
  # pipeline_status: head_pipeline > pipeline の順で取得
  echo "$raw_response" | jq -r --arg ticket "$ticket" '
    [.[] | select(
      (.source_branch | test($ticket; "i")) or
      (.title | test($ticket; "i"))
    ) | {
      sha: .sha,
      iid: .iid,
      title: .title,
      web_url: .web_url,
      project_path: (.web_url | split("/-/")[0] | ltrimstr("https://") | split("/") | .[1:] | join("/")),
      pipeline_status: (.head_pipeline.status // .pipeline.status // null),
      author: (.author.username // null)
    }]'
}

# MR検索結果をサービス名付きに変換
# stdin: search_mrs_by_ticket の出力JSON
# stdout: サービスにマッピングできたMRのみ
map_mrs_to_services() {
  local mrs_json="$1"
  local result="[]"
  local count

  count="$(echo "$mrs_json" | jq 'length')"

  for ((i = 0; i < count; i++)); do
    local project_path sha iid title web_url service

    project_path="$(echo "$mrs_json" | jq -r ".[$i].project_path")"
    sha="$(echo "$mrs_json" | jq -r ".[$i].sha")"
    iid="$(echo "$mrs_json" | jq -r ".[$i].iid")"
    title="$(echo "$mrs_json" | jq -r ".[$i].title")"
    web_url="$(echo "$mrs_json" | jq -r ".[$i].web_url")"

    service="${GITLAB_TO_SERVICE[$project_path]:-}"
    if [[ -z "$service" ]]; then
      log_warn "不明なプロジェクト（スキップ）: $project_path"
      continue
    fi

    local pipeline_status author
    pipeline_status="$(echo "$mrs_json" | jq -r ".[$i].pipeline_status // \"unknown\"")"
    author="$(echo "$mrs_json" | jq -r ".[$i].author // \"unknown\"")"

    result="$(echo "$result" | jq \
      --arg svc "$service" \
      --arg sha "$sha" \
      --arg iid "$iid" \
      --arg title "$title" \
      --arg url "$web_url" \
      --arg proj "$project_path" \
      --arg ps "$pipeline_status" \
      --arg author "$author" \
      '. + [{
        service: $svc,
        sha: $sha,
        iid: ($iid | tonumber),
        title: $title,
        web_url: $url,
        project_path: $proj,
        pipeline_status: $ps,
        author: $author
      }]')"
  done

  echo "$result"
}
