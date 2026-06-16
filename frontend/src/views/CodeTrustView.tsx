import { useState, useEffect, useRef } from "react";
import type { ProjectTrust, FixEntry } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

const LABEL_TONE: Record<string, string> = {
  OK: "text-status-ok",
  REVIEW: "text-status-warn",
  RISK: "text-status-fail",
};

export function CodeTrustView() {
  const { data, loading, error, reload, setData } = useAsync(api.getCodeTrust);
  const [selected, setSelected] = useState<{ pid: string; id: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const { push } = useToast();

  useEffect(() => {
    const t = setInterval(() => {
      if (busyRef.current) return;
      api.getCodeTrust().then(setData).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [setData]);

  if (loading && !data) return <LoadingState label="Loading fixes" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.available) {
    return (
      <EmptyState>
        Trust-HUD not set up — no <code>~/.clean</code> data found.
      </EmptyState>
    );
  }

  const projects = data.projects;
  const totalFixes = projects.reduce((n, p) => n + p.fixes.length, 0);
  const currentProject = selected
    ? projects.find((p) => p.projectId === selected.pid)
    : undefined;
  const current = currentProject?.fixes.find((f) => f.id === selected?.id);

  async function act(action: "apply" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.codeTrustAction({
        projectId: selected.pid,
        id: selected.id,
        action,
        pick: action === "apply" ? pick : undefined,
      });
      setData(res.data);
      setSelected(null);
      setPick(0);
      const tone =
        res.status === "applied" || res.status === "rejected" ? "ok" : "fail";
      push(res.message || res.status, tone);
    } catch (e) {
      push(e instanceof Error ? e.message : "Action failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* list pane */}
      <ScrollArea className="w-80 shrink-0 pr-2">
        <div className="mb-2 flex items-center gap-2 text-2xs uppercase tracking-widest text-fog-500">
          <span>Pending fixes · {totalFixes}</span>
          <span className="text-status-ok" title="Live — refreshes every 3s">● live</span>
        </div>
        {totalFixes === 0 && (
          <EmptyState>No pending fixes across your indexed repos.</EmptyState>
        )}
        {projects.map((p: ProjectTrust) => (
          <div key={p.projectId} className="mb-4">
            <div className="flex items-center justify-between gap-2 px-1 py-1 text-sm">
              <span className="truncate text-fog-200">{p.repo}</span>
              {p.score != null && (
                <span className={`shrink-0 text-2xs ${LABEL_TONE[p.label ?? ""] ?? "text-fog-400"}`}>
                  {p.label ?? "—"} {p.score}{p.indexFresh ? "" : " · stale"}
                </span>
              )}
            </div>
            {p.fixes.length === 0 ? (
              <div className="px-1 text-2xs text-fog-600">— no pending fixes —</div>
            ) : (
              p.fixes.map((f: FixEntry) => {
                const on = selected?.pid === p.projectId && selected.id === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setSelected({ pid: p.projectId, id: f.id });
                      setPick(0);
                    }}
                    className={`mb-1.5 block w-full rounded-lg border px-3 py-2 text-left font-mono text-xs ${
                      on ? "border-accent bg-accent/10" : "border-ink-700 hover:border-ink-600"
                    }`}
                  >
                    <div className="text-fog-400">
                      {f.displayFile}:{f.line ?? "?"}
                    </div>
                    <div className="text-status-fail">{f.badSymbol}</div>
                    <div className="text-status-ok">→ {f.candidates[0] ?? "—"}</div>
                  </button>
                );
              })
            )}
          </div>
        ))}
      </ScrollArea>

      {/* detail pane */}
      <div className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900/50 p-5">
        {!current ? (
          <div className="text-fog-500">Select a fix to review.</div>
        ) : (
          <div className="font-mono text-sm">
            <div className="mb-3 truncate text-fog-400">
              {current.file} · line {current.line ?? "?"}
            </div>
            <div className="mb-2 text-2xs uppercase tracking-widest text-fog-500">
              Likely hallucinated call
            </div>
            <div className="rounded-md border border-ink-700 bg-ink-950 p-3">
              <div className="text-status-fail">- {current.badSymbol}</div>
              <div className="text-status-ok">+ {current.candidates[pick]}</div>
            </div>
            {current.candidates.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fog-400">
                <span>Candidate:</span>
                {current.candidates.map((c, i) => (
                  <button
                    key={c}
                    onClick={() => setPick(i)}
                    className={`rounded px-2 py-0.5 ${
                      i === pick ? "bg-accent/20 text-fog-100" : "text-fog-400 hover:text-fog-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => act("apply")}>
                Apply
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("reject")}>
                Reject
              </Button>
            </div>
            <div className="mt-3 text-2xs text-fog-600">
              Safe: applies only if the symbol occurs exactly once in the file, else marked stale.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
