import { useState, useEffect } from "hono/jsx/dom";
import {
  type MergeRequest,
  STATUS_LABELS,
  type StatusLabel,
  detectStatusLabel,
} from "~/lib/types";
import {
  rebaseMR,
  checkRebaseStatus,
  fetchMRDetails,
  switchMRStatusLabel,
} from "~/lib/gitlab-client";
import { PipelineBadge } from "./PipelineBadge";
import { CommentsModal } from "./CommentsModal";

interface MRCardProps {
  mr: MergeRequest;
  onMRDetailsUpdate: (
    mrId: number,
    pipeline: MergeRequest["pipeline"],
    diverged_commits_count: number,
    approval: MergeRequest["approval"],
    labels?: string[],
  ) => void;
}

type RebaseState = "idle" | "rebasing" | "done" | "conflict" | "error";
type CopyState = "idle" | "copied";

const STATUS_CONFIG: Record<
  StatusLabel,
  { display: string; colorClass: string; cardClass: string }
> = {
  none: { display: "-", colorClass: "status-select-none", cardClass: "" },
  pending: {
    display: "Pending",
    colorClass: "status-select-pending",
    cardClass: "mr-card-status-pending",
  },
  doing: {
    display: "Doing",
    colorClass: "status-select-doing",
    cardClass: "mr-card-status-doing",
  },
  review: {
    display: "Review",
    colorClass: "status-select-review",
    cardClass: "mr-card-status-review",
  },
  fix: {
    display: "Fix",
    colorClass: "status-select-fix",
    cardClass: "mr-card-status-fix",
  },
  done: {
    display: "Done",
    colorClass: "status-select-done",
    cardClass: "mr-card-status-done",
  },
};

function extractRepoName(full: string): string {
  const withoutMR = full.replace(/![0-9]+$/, "");
  const parts = withoutMR.split("/");
  return parts[parts.length - 1] || withoutMR;
}

function extractRepoPath(full: string): string {
  return full.replace(/![0-9]+$/, "");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MRCard({ mr, onMRDetailsUpdate }: MRCardProps) {
  const [rebaseState, setRebaseState] = useState<RebaseState>("idle");
  const [showRebaseConfirm, setShowRebaseConfirm] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [showComments, setShowComments] = useState(false);
  // ユーザーが手動変更した場合のみoverride、それ以外はpropsから導出
  const [userStatusOverride, setUserStatusOverride] =
    useState<StatusLabel | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // 常にpropsのラベルを反映しつつ、ユーザー操作中はoverrideを優先
  const statusLabel = userStatusOverride ?? detectStatusLabel(mr.labels);

  const repoName = extractRepoName(mr.references.full);
  const repoPath = extractRepoPath(mr.references.full);

  const isDiverged =
    mr.diverged_commits_count !== undefined && mr.diverged_commits_count > 0;
  const isDetailsLoaded = mr.diverged_commits_count !== undefined;

  const canRebase =
    mr.state === "opened" &&
    isDetailsLoaded &&
    isDiverged &&
    rebaseState === "idle";

  // コメント情報
  const hasComments = mr.user_notes_count > 0;
  const allDiscussionsResolved = mr.blocking_discussions_resolved;

  // 承認情報
  const isApproved = mr.approval?.approved === true;
  const approvedBy = mr.approval?.approved_by ?? [];
  const approvalLoaded = mr.approval !== undefined;

  useEffect(() => {
    if (!showRebaseConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowRebaseConfirm(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showRebaseConfirm]);

  const handleRebaseClick = () => {
    if (!canRebase) return;
    setShowRebaseConfirm(true);
  };

  const handleRebaseConfirm = async () => {
    setShowRebaseConfirm(false);
    setRebaseState("rebasing");
    try {
      await rebaseMR(mr.project_id, mr.iid);

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await checkRebaseStatus(mr.project_id, mr.iid);
        if (status.has_conflicts) {
          setRebaseState("conflict");
          setTimeout(() => setRebaseState("idle"), 4000);
          return;
        }
        if (!status.rebase_in_progress) {
          setRebaseState("done");
          const details = await fetchMRDetails(mr.project_id, mr.iid);
          onMRDetailsUpdate(
            mr.id,
            details.pipeline,
            details.diverged_commits_count,
            details.approval,
            details.labels,
          );
          setTimeout(() => setRebaseState("idle"), 3000);
          return;
        }
      }
      setRebaseState("idle");
    } catch {
      setRebaseState("error");
      setTimeout(() => setRebaseState("idle"), 3000);
    }
  };

  const handleStatusChange = async (next: StatusLabel) => {
    if (statusUpdating || next === statusLabel) return;
    const prevOverride = userStatusOverride;
    setStatusUpdating(true);
    setUserStatusOverride(next);
    try {
      await switchMRStatusLabel(
        mr.project_id,
        mr.iid,
        statusLabel === "none" ? null : statusLabel,
        next === "none" ? null : next,
      );
    } catch {
      setUserStatusOverride(prevOverride);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCopy = () => {
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const html = `<a href="${escapeHtml(mr.web_url)}">${escapeHtml(mr.title)}</a>`;
    const listener = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", mr.web_url);
      e.preventDefault();
    };
    document.addEventListener("copy", listener);
    document.execCommand("copy");
    document.removeEventListener("copy", listener);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1500);
  };

  const stateClass =
    mr.state === "opened"
      ? "border-l-success"
      : mr.state === "merged"
        ? "border-l-primary"
        : "border-l-error";

  const rebaseButtonContent = () => {
    if (rebaseState === "rebasing") {
      return (
        <>
          <span
            class="loading loading-spinner"
            style="width: 12px; height: 12px;"
          />
          Rebasing...
        </>
      );
    }
    if (rebaseState === "done")
      return (
        <>
          <i class="fas fa-check" aria-hidden="true" />
          Done
        </>
      );
    if (rebaseState === "conflict")
      return (
        <>
          <i class="fas fa-exclamation-triangle" aria-hidden="true" />
          Conflict
        </>
      );
    if (rebaseState === "error")
      return (
        <>
          <i class="fas fa-times" aria-hidden="true" />
          Error
        </>
      );
    if (!isDetailsLoaded) {
      return (
        <>
          <span
            class="loading loading-spinner"
            style="width: 12px; height: 12px;"
          />
          Rebase
        </>
      );
    }
    return (
      <>
        <i class="fas fa-code-merge" aria-hidden="true" />
        Rebase
        {isDiverged && (
          <span class="badge badge-xs badge-warning ml-1">
            +{mr.diverged_commits_count}
          </span>
        )}
      </>
    );
  };

  const rebaseButtonClass = `btn btn-sm btn-ghost gap-1 ${
    rebaseState === "conflict"
      ? "text-warning"
      : rebaseState === "error"
        ? "text-error"
        : !canRebase && rebaseState === "idle" && isDetailsLoaded && !isDiverged
          ? "opacity-30"
          : ""
  }`;

  const rebaseTitle = !isDetailsLoaded
    ? "確認中..."
    : isDiverged
      ? `mainが${mr.diverged_commits_count}コミット進んでいます`
      : "mainと同期済み（リベース不要）";

  return (
    <>
      {showComments && (
        <CommentsModal
          projectId={mr.project_id}
          mrIid={mr.iid}
          mrTitle={mr.title}
          onClose={() => setShowComments(false)}
        />
      )}
      {showRebaseConfirm && (
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          onClick={(e: MouseEvent) => {
            if ((e.target as HTMLElement).classList.contains("modal"))
              setShowRebaseConfirm(false);
          }}
        >
          <div class="modal-box rebase-confirm-box">
            <h3 class="rebase-confirm-title">
              <i class="fas fa-code-merge" aria-hidden="true" />
              Rebase 確認
            </h3>
            <p class="rebase-confirm-desc">
              <strong>{repoName}</strong> !{mr.iid} を
              mainに対してリベースします。
            </p>
            {mr.has_conflicts && (
              <div class="rebase-conflict-warning">
                <i class="fas fa-exclamation-triangle" aria-hidden="true" />
                <div>
                  <strong>コンフリクトが検出されています</strong>
                  <p>手動でコンフリクトを解消してください。</p>
                </div>
              </div>
            )}
            <div class="rebase-confirm-actions">
              <button
                type="button"
                class="btn btn-sm btn-ghost"
                onClick={() => setShowRebaseConfirm(false)}
              >
                閉じる
              </button>
              {!mr.has_conflicts && (
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  onClick={handleRebaseConfirm}
                >
                  <i class="fas fa-code-merge" aria-hidden="true" />
                  リベース実行
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        class={`mr-card ${stateClass} ${STATUS_CONFIG[statusLabel].cardClass}${mr.draft ? " mr-card-draft" : ""}`}
      >
        {/* ヘッダー行: リポジトリ名 + MR番号 + バッジ群 */}
        <div class="mr-card-header">
          <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <span class="mr-repo-name" title={repoPath}>
              {repoName}
            </span>
            <span class="mr-iid">!{mr.iid}</span>
            {mr.draft && <span class="badge badge-sm badge-ghost">Draft</span>}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            {/* コメントバッジ（クリックでモーダル） */}
            {hasComments && (
              <button
                type="button"
                class={`badge badge-sm gap-1 cursor-pointer hover:opacity-80 transition-opacity ${allDiscussionsResolved ? "badge-ghost" : "badge-warning"}`}
                title={
                  allDiscussionsResolved
                    ? "コメントを見る（解決済み）"
                    : "コメントを見る（未解決あり）"
                }
                aria-label={`コメント ${mr.user_notes_count}件 - クリックして表示`}
                onClick={() => setShowComments(true)}
              >
                <i class="fas fa-comment text-[10px]" aria-hidden="true" />
                {mr.user_notes_count}
              </button>
            )}
            {/* 承認バッジ */}
            {approvalLoaded &&
              (isApproved ? (
                <span
                  class="badge badge-sm badge-success gap-1"
                  title={`承認済み: ${approvedBy.map((a) => a.user.username).join(", ")}`}
                >
                  <i class="fas fa-check text-[10px]" aria-hidden="true" />
                  Approved
                </span>
              ) : (
                <span class="badge badge-sm badge-ghost gap-1" title="未承認">
                  <i class="fas fa-clock text-[10px]" aria-hidden="true" />
                  Pending
                </span>
              ))}
            <PipelineBadge pipeline={mr.pipeline} />
          </div>
        </div>

        {/* タイトル */}
        <a
          href={mr.web_url}
          target="_blank"
          rel="noopener noreferrer"
          class="mr-title"
        >
          {mr.title}
        </a>

        {/* メタ情報 + アクション */}
        <div class="mr-card-footer">
          <div class="mr-meta">
            <span class={`mr-state mr-state-${mr.state}`}>{mr.state}</span>
            <span class="mr-date">{formatDate(mr.created_at)}</span>
            <span class="mr-branch" title={mr.source_branch}>
              <i class="fas fa-code-branch text-[10px]" aria-hidden="true" />
              {mr.source_branch}
            </span>
          </div>
          <div class="mr-actions">
            {mr.state === "opened" && (
              <button
                type="button"
                class={rebaseButtonClass}
                onClick={handleRebaseClick}
                disabled={
                  rebaseState === "rebasing" ||
                  (!canRebase && rebaseState === "idle")
                }
                title={rebaseTitle}
              >
                {rebaseButtonContent()}
              </button>
            )}
            {mr.state === "opened" && (
              <div class="status-select-wrapper">
                {statusUpdating && (
                  <span
                    class="loading loading-spinner status-select-spinner"
                    style="width: 12px; height: 12px;"
                  />
                )}
                <select
                  class={`status-select ${STATUS_CONFIG[statusLabel].colorClass}`}
                  onChange={(e: Event) =>
                    handleStatusChange(
                      (e.target as HTMLSelectElement).value as StatusLabel,
                    )
                  }
                  disabled={statusUpdating}
                  aria-label="MRステータス"
                >
                  {STATUS_LABELS.map((s) => (
                    <option key={s} value={s} selected={s === statusLabel}>
                      {STATUS_CONFIG[s].display}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              class="btn btn-sm btn-ghost gap-1"
              onClick={handleCopy}
              title="Slackリンクをコピー"
            >
              {copyState === "copied" ? (
                <>
                  <i class="fas fa-check" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <i class="fas fa-copy" aria-hidden="true" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
