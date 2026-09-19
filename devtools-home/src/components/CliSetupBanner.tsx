import { useState, useEffect } from "hono/jsx/dom";

const STORAGE_KEY = "devtools-cli-setup-dismissed";

const devtoolsInstallCmd =
  'curl -fsSL https://gitlab.example.com/your-org/devtools/devtools-starter/-/raw/main/install-remote.sh | GITLAB_TOKEN="$GITLAB_PERSONAL_ACCESS_TOKEN" bash';

export function CliSetupBanner() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const toggle = () => setOpen((prev) => !prev);

  const handleCopy = (e: Event) => {
    e.preventDefault();
    navigator.clipboard.writeText(devtoolsInstallCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="cli-setup" class="cli-banner mb-10">
      <button type="button" class="cli-banner-toggle" onClick={toggle}>
        <span class="cli-banner-toggle-left">
          <i class="fas fa-terminal text-[13px]"></i>
          <span class="font-semibold text-sm">CLIセットアップガイド</span>
          <span class="cli-banner-badge">はじめての方へ</span>
        </span>
        <i
          class={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} text-[12px]`}
        ></i>
      </button>

      {open && (
        <div class="cli-banner-body">
          <p class="cli-banner-intro">
            CLIツール（devtools,
            kube-deploy）を使うには、以下の2ステップで準備できます。
          </p>

          <div class="cli-banner-steps">
            {/* Step 1 */}
            <div class="cli-step">
              <div class="cli-step-num">1</div>
              <div class="cli-step-content">
                <div class="cli-step-title">
                  GITLAB_PERSONAL_ACCESS_TOKEN を設定
                </div>
                <p class="cli-step-desc">
                  GitLab の{" "}
                  <a
                    href="https://gitlab.example.com/-/user_settings/personal_access_tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="cli-link"
                  >
                    Personal Access Token
                  </a>{" "}
                  を作成し（スコープ: read_api）、
                  <code class="cli-inline-code">~/.zshrc</code> または{" "}
                  <code class="cli-inline-code">~/.bashrc</code>{" "}
                  に追記してください。
                </p>
                <div class="cli-code-block">
                  <code>
                    export GITLAB_PERSONAL_ACCESS_TOKEN="glpat-xxxxxxxxxxxx"
                  </code>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div class="cli-step">
              <div class="cli-step-num">2</div>
              <div class="cli-step-content">
                <div class="cli-step-title">devtools CLI をインストール</div>
                <p class="cli-step-desc">
                  以下のコマンドを実行すると{" "}
                  <code class="cli-inline-code">/usr/local/bin/devtools</code>{" "}
                  に配置されます。
                </p>
                <div class="cli-code-block">
                  <code class="cli-code-wrap">$ {devtoolsInstallCmd}</code>
                  <button
                    type="button"
                    class="cli-copy-btn"
                    onClick={handleCopy}
                  >
                    <i
                      class={`fas ${copied ? "fa-check" : "fa-copy"} text-[11px]`}
                    ></i>
                    {copied ? "コピー済み" : "コピー"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="cli-banner-footer">
            <button type="button" class="cli-dismiss-btn" onClick={dismiss}>
              <i class="fas fa-check text-[11px]"></i>
              セットアップ済み・非表示にする
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
