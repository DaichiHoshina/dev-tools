import { useState } from "hono/jsx/dom";
import type { Tool } from "~/data/tools";

interface ToolCardProps {
  tool: Tool;
}

export function ToolCard({ tool }: ToolCardProps) {
  const isComingSoon = tool.status === "coming-soon";
  const isCli =
    tool.type === "cli" || (!tool.type && tool.href.startsWith("http"));
  const hasInstall = !!tool.installCommand;

  const [showInstall, setShowInstall] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (tool.installCommand) {
      navigator.clipboard.writeText(tool.installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleInstall = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    setShowInstall((prev) => !prev);
  };

  const cardContent = (
    <div
      class={`card-modern h-full ${isComingSoon ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div class="p-5 h-full">
        <div class="flex items-start gap-3 h-full">
          <div class={`tool-icon ${tool.favicon ? "" : "tool-icon-fallback"}`}>
            {tool.favicon ? (
              <img src={tool.favicon} alt="" />
            ) : (
              <i class={`fas ${tool.icon}`}></i>
            )}
          </div>

          <div class="flex-1 min-w-0 flex flex-col">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-bold text-[15px] text-neutral m-0">
                {tool.name}
              </h3>
              {isCli && <span class="badge-pill badge-pill-type">CLI</span>}
              {tool.featured && (
                <span
                  class="badge-pill badge-pill-featured"
                  title="よく使われています"
                >
                  <i class="fas fa-star text-[9px]"></i>
                </span>
              )}
              {isComingSoon && (
                <span class="badge-pill badge-pill-soon">Soon</span>
              )}
            </div>
            <p class="text-xs text-secondary leading-relaxed line-clamp-2 mb-3">
              {tool.description}
            </p>

            {!isComingSoon && (
              <div class="flex items-center gap-2 mt-auto flex-wrap">
                {isCli ? (
                  <>
                    <span class="btn btn-xs btn-primary gap-1.5 rounded-lg">
                      リポジトリ
                      <i class="fas fa-external-link text-[10px]"></i>
                    </span>
                    {hasInstall && (
                      <button
                        type="button"
                        class={`btn btn-xs gap-1.5 rounded-lg install-toggle-btn ${showInstall ? "install-toggle-btn-active" : ""}`}
                        onClick={toggleInstall}
                      >
                        インストール
                        <i
                          class={`fas ${showInstall ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`}
                        ></i>
                      </button>
                    )}
                    {!hasInstall && (
                      <span class="text-[11px] text-secondary/50">
                        git clone して利用
                      </span>
                    )}
                  </>
                ) : (
                  <span class="btn btn-xs btn-primary gap-1.5 rounded-lg">
                    開く
                    <i class="fas fa-arrow-right text-[10px]"></i>
                  </span>
                )}
              </div>
            )}

            {showInstall && tool.installCommand && (
              <div
                class="install-block mt-3"
                onClick={(e: Event) => e.stopPropagation()}
              >
                <div class="install-block-header">
                  <span class="install-block-label">インストールコマンド</span>
                  <button
                    type="button"
                    class="install-copy-btn"
                    onClick={handleCopy}
                  >
                    <i
                      class={`fas ${copied ? "fa-check" : "fa-copy"} text-[11px]`}
                    ></i>
                    {copied ? "コピー済み" : "コピー"}
                  </button>
                </div>
                <div class="install-block-code">
                  <code>$ {tool.installCommand}</code>
                </div>
                <p class="install-block-note">
                  ※ GITLAB_PERSONAL_ACCESS_TOKEN の設定が必要です
                </p>
              </div>
            )}

            {!isComingSoon && tool.links && tool.links.length > 0 && (
              <div class="flex flex-wrap gap-2 pt-3 mt-3 border-t border-base-300/50">
                {tool.links.map((link) => (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="sublink-btn"
                    onClick={(e: Event) => e.stopPropagation()}
                  >
                    <i class="fab fa-gitlab text-[11px]"></i>
                    {link.label}
                    <i class="fas fa-external-link text-[9px] opacity-50"></i>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isComingSoon) {
    return cardContent;
  }

  const linkHref = isCli ? (tool.repoUrl ?? tool.href) : tool.href;
  const isExternal = linkHref.startsWith("http");

  return (
    <a
      href={linkHref}
      class="block no-underline h-full"
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {cardContent}
    </a>
  );
}
