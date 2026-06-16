import { useState } from "react";
import type {
  GbrainSearchResponse,
  GbrainHooksConfig,
} from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Spinner } from "@/components/ui/Spinner";
import { SearchIcon } from "@/components/icons";
import { LoadingState, ErrorState } from "@/components/ViewState";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-fog-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-fog-100">{value}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-left transition-colors hover:border-ink-600"
    >
      <span className="min-w-0">
        <span className="block text-sm text-fog-100">{label}</span>
        {hint ? (
          <span className="block text-2xs text-fog-500">{hint}</span>
        ) : null}
      </span>
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
          (checked ? "bg-accent" : "bg-ink-600")
        }
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all " +
            (checked ? "left-4" : "left-0.5")
          }
        />
      </span>
    </button>
  );
}

function StatusCard() {
  const { data, loading, error, reload } = useAsync(api.gbrainStatus);

  if (loading && !data) return <LoadingState label="Checking brain" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fog-50">Status</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-fog-400">
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (data.ok ? "bg-status-ok" : "bg-status-fail")
              }
            />
            {data.ok ? "Connected" : "Unavailable"}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </CardHeader>
      <CardBody>
        {data.ok ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Version" value={data.version || "—"} />
              <Stat label="Engine" value={data.engine || "—"} />
              <Stat label="Embedder" value={data.embedder || "—"} />
              <Stat label="Pages" value={data.pages} />
            </div>
            {data.hint ? (
              <p className="mt-4 text-xs text-fog-500">{data.hint}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-status-warn">
            {data.hint || "GBrain is not reachable."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function SearchCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GbrainSearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setResults(await api.gbrainSearch(query.trim()));
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-semibold text-fog-50">Search</span>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <form onSubmit={run} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fog-500">
              <SearchIcon width={14} height={14} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the brain…"
              className="pl-8"
            />
          </div>
          <Button type="submit" size="md" variant="secondary" disabled={busy}>
            {busy ? "Searching" : "Search"}
          </Button>
        </form>

        {err ? <div className="text-xs text-status-fail">{err}</div> : null}

        {results ? (
          results.results.length === 0 ? (
            <p className="text-sm text-fog-500">No results for “{results.query}”.</p>
          ) : (
            <ScrollArea className="max-h-72">
              <ul className="space-y-2">
                {results.results.map((r) => (
                  <li
                    key={r.slug}
                    className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fog-100">
                        {r.title || r.slug}
                      </span>
                      <span className="shrink-0 font-mono text-2xs text-fog-500">
                        {r.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-fog-400">
                      {r.snippet}
                    </p>
                    {r.type ? (
                      <span className="mt-1 inline-block text-2xs uppercase tracking-wide text-fog-600">
                        {r.type}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )
        ) : null}
      </CardBody>
    </Card>
  );
}

function RecentCard() {
  const { data, loading, error, reload } = useAsync(api.gbrainRecent);

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-semibold text-fog-50">Recent</span>
        <Button size="sm" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </CardHeader>
      <CardBody>
        {loading && !data ? (
          <Spinner label="Loading" />
        ) : error && !data ? (
          <p className="text-xs text-status-fail">{error}</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-fog-500">Nothing recent.</p>
        ) : (
          <ScrollArea className="max-h-[22rem] pr-1">
            <ul className="space-y-1.5">
              {data.items.map((item) => (
                <li
                  key={item.slug}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-fog-200" title={item.title || item.slug}>
                    {item.title || item.slug}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-fog-500">
                    {item.when}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardBody>
    </Card>
  );
}

function SyncCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      await api.gbrainSync();
      toast.push("Brain sync complete.", "ok");
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Sync failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-fog-50">Sync</div>
          <div className="text-xs text-fog-500">
            Re-index curated artifacts and transcripts.
          </div>
        </div>
        <Button
          size="md"
          variant="primary"
          onClick={sync}
          disabled={busy}
          className="shrink-0 whitespace-nowrap"
        >
          {busy ? "Syncing" : "Sync now"}
        </Button>
      </CardBody>
    </Card>
  );
}

function SessionBrainCard() {
  const { data, loading, error, reload, setData } = useAsync(
    api.getGbrainHooks,
  );
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <LoadingState label="Loading hooks" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  function update(patch: Partial<GbrainHooksConfig>) {
    if (!data) return;
    setData({ ...data, ...patch });
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const next = await api.setGbrainHooks(data);
      setData(next);
      toast.push("Session brain settings saved.", "ok");
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Save failed", "fail");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fog-50">
            Session brain
          </span>
          <Badge tone={data.installed ? "ok" : "off"}>
            {data.installed ? "installed" : "not installed"}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving" : "Save"}
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-2.5">
        <Toggle
          label="Recall on session start"
          hint="Inject relevant memory when a session begins"
          checked={data.recall}
          onChange={(v) => update({ recall: v })}
        />
        <Toggle
          label="Capture on session end"
          hint="Persist what was learned this session"
          checked={data.capture}
          onChange={(v) => update({ capture: v })}
        />
        <Toggle
          label="Per-prompt recall"
          hint="Recall before every prompt — higher token cost"
          checked={data.perPromptRecall}
          onChange={(v) => update({ perPromptRecall: v })}
        />
        <label className="mt-1 block max-w-[160px]">
          <Label>Top K results</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={data.topK}
            onChange={(e) =>
              update({ topK: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
      </CardBody>
    </Card>
  );
}

export function GbrainView() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4">
        {/* Status + Sync: compact top row, full width */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StatusCard />
          </div>
          <SyncCard />
        </div>
        {/* Controls (the point of this tab) on the left, reference list on the right */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SessionBrainCard />
            <SearchCard />
          </div>
          <RecentCard />
        </div>
      </div>
    </ScrollArea>
  );
}
