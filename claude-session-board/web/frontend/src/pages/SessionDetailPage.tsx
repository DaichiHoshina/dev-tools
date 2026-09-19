import { useState, useEffect, useCallback, memo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Markdown, { type Components } from "react-markdown";
import {
  ArrowLeft,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Clock,
  RefreshCw,
  Wrench,
  Terminal,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { extractText, formatDate } from "../lib/utils";
import type { SessionDetail, MessageRecord, ContentBlock } from "../lib/types";

function CodeBlock({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? "").replace(/\n$/, "");
  const lang = className?.replace("language-", "") ?? "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードAPI非対応・権限拒否時は何もしない
    }
  };

  return (
    <div className="relative group">
      {lang && (
        <span className="absolute top-1.5 left-3 text-[10px] text-base-content/30 font-mono">
          {lang}
        </span>
      )}
      <button
        className="absolute top-1.5 right-1.5 btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
        title="コピー"
      >
        {copied ? (
          <Check className="w-3 h-3 text-success" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      <pre className={className}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function ToolCallDetail({ block }: { block: ContentBlock }) {
  const isUse = block.type === "tool_use";
  return (
    <details className="group/tool">
      <summary className="cursor-pointer flex items-center gap-2 py-1 hover:bg-base-200/50 rounded px-1">
        <ChevronRight className="w-3 h-3 text-base-content/30 transition-transform group-open/tool:rotate-90" />
        <span className={isUse ? "text-primary" : "text-success"}>
          {block.type}
        </span>
        {block.name && <span className="text-warning">{block.name}</span>}
      </summary>
      {isUse && block.input != null && (
        <pre className="bg-base-200 rounded px-2 py-1 ml-5 mt-1 overflow-auto max-h-40 text-[11px] whitespace-pre-wrap">
          {typeof block.input === "string"
            ? block.input
            : JSON.stringify(block.input, null, 2)}
        </pre>
      )}
      {!isUse && block.content != null && (
        <pre className="bg-base-200 rounded px-2 py-1 ml-5 mt-1 overflow-auto max-h-40 text-[11px] whitespace-pre-wrap">
          {typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content, null, 2)}
        </pre>
      )}
    </details>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

const MessageBubble = memo(function MessageBubble({
  msg,
}: {
  msg: MessageRecord;
}) {
  const isUser = msg.type === "user";
  const content = msg.message?.content;
  const text = extractText(content);
  const model = msg.message?.model;
  const usage = msg.message?.usage;

  const toolBlocks = Array.isArray(content)
    ? content.filter(
        (b: ContentBlock) => b.type === "tool_use" || b.type === "tool_result",
      )
    : [];

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* アバター */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
          isUser
            ? "bg-primary text-primary-content"
            : "bg-base-300 text-base-content/70"
        }`}
      >
        {isUser ? "U" : "C"}
      </div>

      {/* バブル */}
      <div
        className={`max-w-[75%] space-y-1.5 ${isUser ? "items-end" : "items-start"} flex flex-col`}
      >
        {/* メタ情報 */}
        <div
          className={`flex items-center gap-2 text-xs text-base-content/40 ${isUser ? "flex-row-reverse" : ""}`}
        >
          {msg.timestamp && <span>{formatDate(msg.timestamp)}</span>}
          {model && (
            <span className="bg-base-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
              {model.replace("claude-", "")}
            </span>
          )}
          {usage && (
            <span className="text-[10px] text-base-content/30">
              {usage.input_tokens ?? 0}↑ {usage.output_tokens ?? 0}↓
            </span>
          )}
        </div>

        {/* テキスト */}
        {text && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm break-words leading-relaxed ${
              isUser
                ? "bg-primary text-primary-content rounded-tr-sm"
                : "bg-base-200 text-base-content rounded-tl-sm"
            }`}
          >
            {isUser ? (
              <span className="whitespace-pre-wrap">{text}</span>
            ) : (
              <div className="prose prose-sm max-w-none prose-pre:bg-base-300 prose-code:bg-base-300 prose-code:px-1 prose-code:rounded prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2">
                <Markdown components={markdownComponents}>{text}</Markdown>
              </div>
            )}
          </div>
        )}

        {/* ツール呼び出し */}
        {toolBlocks.length > 0 && (
          <details className="text-xs w-full">
            <summary className="cursor-pointer text-base-content/40 hover:text-base-content flex items-center gap-1.5 select-none">
              <Wrench className="w-3 h-3" />
              ツール呼び出し ({toolBlocks.length})
            </summary>
            <div className="bg-base-300 rounded-lg p-2.5 mt-1 font-mono text-xs max-h-64 overflow-auto space-y-0.5">
              {toolBlocks.map((b: ContentBlock, i: number) => (
                <ToolCallDetail key={i} block={b} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
});

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const project = searchParams.get("project") ?? undefined;
  const cwd = searchParams.get("cwd") ?? undefined;

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    // sessionId変更時に古いfetchの結果が上書きしないようキャンセルフラグを使用
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setError(null);
    api
      .session(sessionId, project, cwd)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, project, cwd]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="alert alert-error">
        <span>{error ?? "セッションが見つかりません"}</span>
        <button
          className="btn btn-sm"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/history")
          }
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </button>
      </div>
    );
  }

  const { entry, messages } = detail;
  const visibleMessages = messages.filter(
    (m) => m.type === "user" || m.type === "assistant",
  );

  return (
    <div className="space-y-4 max-w-4xl">
      {/* ヘッダー */}
      <div>
        <button
          className="flex items-center gap-1.5 text-sm text-base-content/60 hover:text-base-content transition-colors mb-3"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/history")
          }
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </button>
        <div className="bg-base-100 rounded-xl border border-base-300 p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-base font-semibold leading-snug flex-1">
              {entry.summary || "(サマリなし)"}
            </h1>
            <button
              className={`btn btn-sm gap-1 shrink-0 ${
                resuming ? "btn-success" : "btn-outline"
              }`}
              onClick={() => {
                setResuming(true);
                api
                  .openTerminal(entry.sessionId, entry.projectPath)
                  .catch(() => {})
                  .finally(() => {
                    setTimeout(() => setResuming(false), 2000);
                  });
              }}
              disabled={resuming}
            >
              {resuming ? (
                "OK"
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5" />
                  再開
                </>
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-base-content/50">
            <span className="flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5" />
              {entry.projectDisplayName}
            </span>
            {entry.gitBranch && (
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5" />
                {entry.gitBranch}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {entry.messageCount} メッセージ
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(entry.created)}
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              {formatDate(entry.modified)}
            </span>
          </div>
        </div>
      </div>

      {/* 会話 */}
      <div className="bg-base-100 rounded-xl border border-base-300 p-5">
        {visibleMessages.length === 0 ? (
          <div className="text-center text-base-content/50 py-8 text-sm">
            表示できるメッセージがありません
          </div>
        ) : (
          <div className="space-y-5">
            {visibleMessages.map((msg, i) => (
              <MessageBubble key={msg.uuid ?? i} msg={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
