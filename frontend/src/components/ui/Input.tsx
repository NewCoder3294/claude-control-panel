import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-sm text-fog-100 placeholder:text-fog-600 " +
  "transition-colors focus-visible:outline-none focus-visible:border-fog-400 focus-visible:ring-1 focus-visible:ring-fog-400/40 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "resize-none font-mono", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-1 block text-2xs font-semibold uppercase tracking-widest text-fog-500",
        className,
      )}
    >
      {children}
    </span>
  );
}
