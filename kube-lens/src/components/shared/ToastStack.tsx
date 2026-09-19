export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const TOAST_ICON: Record<ToastType, string> = {
  success: "fa-circle-check",
  error: "fa-circle-xmark",
  warning: "fa-triangle-exclamation",
  info: "fa-circle-info",
};

const TOAST_COLOR: Record<ToastType, string> = {
  success: "oklch(var(--su))",
  error: "oklch(var(--er))",
  warning: "oklch(var(--wa))",
  info: "oklch(var(--in))",
};

const TOAST_BORDER: Record<ToastType, string> = {
  success: "oklch(var(--su) / 0.4)",
  error: "oklch(var(--er) / 0.4)",
  warning: "oklch(var(--wa) / 0.4)",
  info: "oklch(var(--in) / 0.4)",
};

export function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          class="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in"
          style={`background: var(--bg-surface); border: 1px solid ${TOAST_BORDER[t.type]}; color: ${TOAST_COLOR[t.type]}; min-width: 260px; max-width: 400px`}
        >
          <i class={`fas ${TOAST_ICON[t.type]} shrink-0`} />
          <span class="flex-1 text-xs">{t.message}</span>
          <button
            type="button"
            onClick={() => onClose(t.id)}
            class="shrink-0 opacity-60 hover:opacity-100 ml-1"
          >
            <i class="fas fa-xmark text-xs" />
          </button>
        </div>
      ))}
    </div>
  );
}
