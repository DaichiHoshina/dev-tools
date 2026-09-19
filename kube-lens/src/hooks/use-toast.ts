import { useState, useRef } from "hono/jsx/dom";
import type { ToastType, ToastItem } from "~/components/shared/ToastStack";

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef<number>(0);

  const addToast = (message: string, type: ToastType) => {
    idRef.current = (idRef.current ?? 0) + 1;
    const id = idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      5000,
    );
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}
