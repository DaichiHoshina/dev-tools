import { useState } from "hono/jsx/dom";
import {
  type MergeRequest,
  STATUS_PRIORITY,
  detectStatusLabel,
} from "~/lib/types";
import { MRCard } from "./MRCard";

interface MRListProps {
  results: MergeRequest[];
  loading: boolean;
  searched: boolean;
  onMRDetailsUpdate: (
    mrId: number,
    pipeline: MergeRequest["pipeline"],
    diverged_commits_count: number,
    approval: MergeRequest["approval"],
    labels?: string[],
  ) => void;
}

function sortByStatus(mrs: MergeRequest[]): MergeRequest[] {
  return [...mrs].sort((a, b) => {
    const aPriority = STATUS_PRIORITY[detectStatusLabel(a.labels)];
    const bPriority = STATUS_PRIORITY[detectStatusLabel(b.labels)];
    if (aPriority !== bPriority) return aPriority - bPriority;
    // draft は同じステータス内で後ろに
    if (a.draft !== b.draft) return a.draft ? 1 : -1;
    // 同一ステータス内は更新日の新しい順
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function MRList({
  results,
  loading,
  searched,
  onMRDetailsUpdate,
}: MRListProps) {
  const [sortByStatusEnabled, setSortByStatusEnabled] = useState(true);

  if (loading) {
    return (
      <div class="flex flex-col items-center justify-center py-16 gap-3">
        <span class="loading loading-spinner loading-lg text-primary" />
        <span style="color: var(--text-muted)">MRを検索中...</span>
      </div>
    );
  }

  if (!searched) {
    return (
      <div class="empty-state">
        <i
          class="fas fa-search text-4xl"
          style="color: var(--text-subtle)"
          aria-hidden="true"
        />
        <p style="color: var(--text-muted)">
          ユーザー名を入力して検索してください
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div class="empty-state">
        <i
          class="fas fa-inbox text-4xl"
          style="color: var(--text-subtle)"
          aria-hidden="true"
        />
        <p style="color: var(--text-muted)">該当するMRが見つかりませんでした</p>
      </div>
    );
  }

  const displayResults = sortByStatusEnabled ? sortByStatus(results) : results;

  return (
    <div>
      <div class="result-count-row">
        <span class="result-count-text">{results.length}件のMR</span>
        <button
          type="button"
          class={`sort-status-btn${sortByStatusEnabled ? " sort-status-btn-active" : ""}`}
          onClick={() => setSortByStatusEnabled((v) => !v)}
          title={
            sortByStatusEnabled
              ? "ステータスソートをオフにする"
              : "ステータスの進行度順に並び替える"
          }
        >
          <i class="fas fa-arrow-up-wide-short" aria-hidden="true" />
          ステータス順
        </button>
      </div>
      <div class="mr-list">
        {displayResults.map((mr) => (
          <MRCard key={mr.id} mr={mr} onMRDetailsUpdate={onMRDetailsUpdate} />
        ))}
      </div>
    </div>
  );
}
