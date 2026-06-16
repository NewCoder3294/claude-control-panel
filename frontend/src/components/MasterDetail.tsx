import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ScrollArea } from "@/components/ui/ScrollArea";

export interface ListEntry {
  key: string;
  label: string;
  subLabel?: string;
  /** Optional small right-aligned annotation (e.g. byte size, "missing"). */
  meta?: ReactNode;
}

interface MasterDetailProps {
  groups: { heading: string; entries: ListEntry[] }[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  detail: ReactNode;
}

export function MasterDetail({
  groups,
  selectedKey,
  onSelect,
  detail,
}: MasterDetailProps) {
  return (
    <div className="flex h-full min-h-0 gap-4">
      <ScrollArea className="w-72 shrink-0 rounded-lg border border-ink-700 bg-ink-850">
        <div className="p-2">
          {groups.map((group) => (
            <div key={group.heading} className="mb-2 last:mb-0">
              <div className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-widest text-fog-500">
                {group.heading}
              </div>
              <ul className="space-y-0.5">
                {group.entries.length === 0 ? (
                  <li className="px-2 py-1.5 text-xs text-fog-600">None</li>
                ) : (
                  group.entries.map((entry) => {
                    const isActive = entry.key === selectedKey;
                    return (
                      <li key={entry.key}>
                        <button
                          type="button"
                          onClick={() => onSelect(entry.key)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            isActive
                              ? "bg-ink-750 text-fog-50"
                              : "text-fog-300 hover:bg-ink-800 hover:text-fog-100",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {entry.label}
                            </span>
                            {entry.subLabel ? (
                              <span className="block truncate font-mono text-2xs text-fog-500">
                                {entry.subLabel}
                              </span>
                            ) : null}
                          </span>
                          {entry.meta ? (
                            <span className="shrink-0 text-2xs text-fog-500">
                              {entry.meta}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
        {detail}
      </div>
    </div>
  );
}
