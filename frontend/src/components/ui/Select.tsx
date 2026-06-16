import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full appearance-none rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-sm text-fog-100",
      "transition-colors focus-visible:outline-none focus-visible:border-fog-400 focus-visible:ring-1 focus-visible:ring-fog-400/40",
      "disabled:cursor-not-allowed disabled:opacity-40",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
