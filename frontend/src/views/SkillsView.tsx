import { useMemo, useState } from "react";
import type { Skill } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { SearchIcon } from "@/components/icons";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

export function SkillsView() {
  const { data, loading, error, reload, setData } = useAsync(api.getSkills);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const test = (s: Skill) =>
      !filter ||
      s.name.toLowerCase().includes(filter) ||
      s.description.toLowerCase().includes(filter);
    return {
      active: data?.active.filter(test) ?? [],
      archived: data?.archived.filter(test) ?? [],
    };
  }, [data, filter]);

  if (loading && !data) return <LoadingState label="Reading skills" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No skills found.</EmptyState>;

  async function act(name: string, action: "archive" | "restore") {
    setPending(name);
    setActionError(null);
    try {
      const next = await api.skillAction({ name, action });
      setData(next);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog-500">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter skills by name or description"
            className="h-9 w-full rounded-md border border-ink-700 bg-ink-850 pl-9 pr-3 text-sm text-fog-100 placeholder:text-fog-500 focus:border-ink-500 focus:outline-none"
          />
        </div>
        <div className="font-mono text-2xs text-fog-500">
          {data.active.length} active · {data.archived.length} archived
        </div>
      </div>

      {actionError ? (
        <div className="rounded-md border border-status-fail/30 bg-status-fail/10 px-3 py-2 text-xs text-status-fail">
          {actionError}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <SkillSection
          title="Active"
          count={matches.active.length}
          skills={matches.active}
          action="archive"
          actionLabel="Archive"
          pending={pending}
          onAction={act}
          defaultOpen
          forceOpen
        />
        <SkillSection
          title="Archived"
          count={matches.archived.length}
          skills={matches.archived}
          action="restore"
          actionLabel="Restore"
          pending={pending}
          onAction={act}
          defaultOpen={false}
          forceOpen={!!filter}
        />
      </ScrollArea>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  skills: Skill[];
  action: "archive" | "restore";
  actionLabel: string;
  pending: string | null;
  onAction: (name: string, action: "archive" | "restore") => void;
  defaultOpen: boolean;
  forceOpen: boolean;
}

function SkillSection({
  title,
  count,
  skills,
  action,
  actionLabel,
  pending,
  onAction,
  defaultOpen,
  forceOpen,
}: SectionProps) {
  const [userOpen, setUserOpen] = useState(defaultOpen);
  const open = forceOpen || userOpen;
  return (
    <section className="mb-6 last:mb-0">
      <button
        type="button"
        onClick={() => setUserOpen((v) => !v)}
        disabled={forceOpen}
        className="mb-2 flex w-full items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-fog-500 disabled:cursor-default"
      >
        <span className={cn("text-fog-600 transition-transform", open && "rotate-90")}>
          ▸
        </span>
        {title}
        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-fog-400">
          {count}
        </span>
      </button>
      {!open ? null : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-xs text-fog-600">
          No matching skills.
        </div>
      ) : (
        <ul className="divide-y divide-ink-800 overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
          {skills.map((skill) => {
            const busy = pending === skill.name;
            return (
              <li
                key={skill.path}
                className={cn(
                  "flex items-center gap-4 px-4 py-3",
                  busy && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm text-fog-100">
                    {skill.name}
                  </div>
                  {skill.description ? (
                    <div className="mt-0.5 truncate text-xs text-fog-400">
                      {skill.description}
                    </div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant={action === "archive" ? "ghost" : "secondary"}
                  disabled={busy}
                  onClick={() => onAction(skill.name, action)}
                >
                  {busy ? "Working" : actionLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
