import { useState } from "hono/jsx/dom";
import type { Child } from "hono/jsx";

const STORAGE_KEY = "kube-lens-guide-dismissed";

interface Props {
  /** ページ固有のキー（localStorage保存用） */
  id: string;
  children: Child;
}

/** 折りたたみ可能なページガイド */
export function PageGuide({ id, children }: Props) {
  const storageKey = `${STORAGE_KEY}-${id}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    const next = !dismissed;
    setDismissed(next);
    try {
      if (next) {
        localStorage.setItem(storageKey, "1");
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div class="page-guide">
      <button
        type="button"
        onClick={toggle}
        class="page-guide-toggle"
        title={dismissed ? "ガイドを表示" : "ガイドを閉じる"}
      >
        <i class={`fas fa-lightbulb ${dismissed ? "" : "text-warning"}`} />
        {dismissed ? (
          <span>ガイドを表示</span>
        ) : (
          <span>このページの見かた</span>
        )}
        <i
          class={`fas fa-chevron-${dismissed ? "down" : "up"} text-[10px] ml-auto`}
        />
      </button>
      {!dismissed && <div class="page-guide-body">{children}</div>}
    </div>
  );
}
