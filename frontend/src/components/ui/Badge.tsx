import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ok" | "warn" | "fail" | "off" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: "bg-ink-750 text-fog-400 border-ink-700",
  ok: "bg-status-ok/8 text-status-ok border-status-ok/25",
  warn: "bg-status-warn/8 text-status-warn border-status-warn/25",
  fail: "bg-status-fail/8 text-status-fail border-status-fail/25",
  off: "bg-ink-750 text-fog-500 border-ink-700",
  outline: "bg-transparent text-fog-400 border-ink-700",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
