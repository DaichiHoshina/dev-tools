import { useState, useEffect } from "hono/jsx/dom";
import type { MRNote } from "~/lib/types";
import { fetchMRNotes } from "~/lib/gitlab-client";

interface CommentsModalProps {
  projectId: number;
  mrIid: number;
  mrTitle: string;
  onClose: () => void;
}

type NoteCopyState = "idle" | "copied";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CommentsModal({
  projectId,
  mrIid,
  mrTitle,
  onClose,
}: CommentsModalProps) {
  const [notes, setNotes] = useState<MRNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<number, NoteCopyState>>(
    {},
  );

  useEffect(() => {
    fetchMRNotes(projectId, mrIid)
      .then((data) => setNotes(data))
      .catch(() => setError("コメントの取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [projectId, mrIid]);

  // Escapeキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // dialog外クリックで閉じる
  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("modal")) {
      onClose();
    }
  };

  const handleCopyNote = (note: MRNote) => {
    navigator.clipboard
      .writeText(note.body)
      .then(() => {
        setCopyStates((prev) => ({ ...prev, [note.id]: "copied" }));
        setTimeout(() => {
          setCopyStates((prev) => ({ ...prev, [note.id]: "idle" }));
        }, 1500);
      })
      .catch(() => {});
  };

  return (
    <div
      class="modal modal-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comments-modal-title"
      onClick={handleBackdropClick}
    >
      <div class="modal-box comments-modal-box">
        {/* ヘッダー */}
        <div class="comments-modal-header">
          <div class="min-w-0">
            <h3 id="comments-modal-title" class="comments-modal-title">
              <i class="fas fa-comments" aria-hidden="true" />
              コメント
            </h3>
            <p class="comments-modal-subtitle" title={mrTitle}>
              {mrTitle}
            </p>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            aria-label="閉じる"
          >
            <i class="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        {/* コンテンツ */}
        <div class="comments-modal-body">
          {loading && (
            <div class="flex flex-col items-center justify-center py-12 gap-3">
              <span class="loading loading-spinner loading-md text-primary" />
              <span style="color: var(--text-muted); font-size: 13px;">
                読み込み中...
              </span>
            </div>
          )}

          {error && (
            <div
              class="flex items-center justify-center py-10 gap-2"
              style="color: oklch(var(--er))"
            >
              <i class="fas fa-exclamation-circle" aria-hidden="true" />
              <span style="font-size: 13px;">{error}</span>
            </div>
          )}

          {!loading && !error && notes.length === 0 && (
            <div
              class="flex flex-col items-center justify-center py-12 gap-2"
              style="color: var(--text-muted)"
            >
              <i
                class="fas fa-comment-slash text-2xl"
                style="opacity: 0.4"
                aria-hidden="true"
              />
              <span style="font-size: 13px;">コメントはありません</span>
            </div>
          )}

          {!loading && !error && notes.length > 0 && (
            <div class="comments-list">
              {notes.map((note) => (
                <div
                  key={note.id}
                  class={`comment-item ${note.resolvable && note.resolved ? "comment-resolved" : ""}`}
                >
                  {/* コメントヘッダー */}
                  <div class="comment-header">
                    <div class="flex items-center gap-2 min-w-0">
                      <img
                        src={note.author.avatar_url}
                        alt=""
                        class="w-6 h-6 rounded-full shrink-0"
                      />
                      <span class="comment-author">{note.author.name}</span>
                      <span class="comment-date">
                        {formatDate(note.created_at)}
                      </span>
                      {note.resolvable && (
                        <span
                          class={`badge badge-xs ${note.resolved ? "badge-success" : "badge-warning"}`}
                        >
                          {note.resolved ? "解決済み" : "未解決"}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs comment-copy-btn"
                      onClick={() => handleCopyNote(note)}
                      title="コメントをコピー"
                      aria-label="コメントをコピー"
                    >
                      {copyStates[note.id] === "copied" ? (
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
                  {/* コメント本文 */}
                  <p class="comment-body">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
