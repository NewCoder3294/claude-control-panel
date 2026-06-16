import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "ok" | "fail" | "neutral";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto animate-fade-in rounded-md border px-3 py-2 text-sm shadow-panel backdrop-blur",
              t.tone === "ok" &&
                "border-status-ok/30 bg-status-ok/10 text-status-ok",
              t.tone === "fail" &&
                "border-status-fail/30 bg-status-fail/10 text-status-fail",
              t.tone === "neutral" &&
                "border-ink-600 bg-ink-850/95 text-fog-100",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail open: no-op so views never crash if rendered outside the provider.
    return { push: () => {} };
  }
  return ctx;
}
