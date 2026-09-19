import { useState } from "hono/jsx/dom";
import type { Child } from "hono/jsx";

interface Props {
  text: string;
  children: Child;
}

export function Tooltip({ text, children }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      class="tooltip-wrap"
      onMouseEnter={(e: MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          class="tooltip-popup"
          style={`position:fixed;left:${pos.x}px;top:${pos.y - 8}px;transform:translateX(-50%) translateY(-100%);z-index:9999;visibility:visible;opacity:1`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
