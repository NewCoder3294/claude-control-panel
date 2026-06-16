import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-fog-400">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-md border border-status-fail/30 bg-status-fail/10 px-4 py-3 text-sm text-status-fail">
        {message}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center px-6 text-center text-sm text-fog-400">
      {children}
    </div>
  );
}
