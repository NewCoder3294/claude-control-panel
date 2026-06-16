import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import type { ConfigFile, FileWriteResponse } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

type FileTab = "settings" | "local";
type Mode = "form" | "raw";

interface HookSummary {
  event: string;
  command: string;
}

interface ParsedSettings {
  /** The full parsed object, mutated in place by the form. */
  obj: Record<string, unknown>;
  allow: string[];
  deny: string[];
  ask: string[];
  env: { key: string; value: string }[];
  hooks: HookSummary[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function parsePermissions(obj: Record<string, unknown>) {
  const perms =
    obj.permissions && typeof obj.permissions === "object"
      ? (obj.permissions as Record<string, unknown>)
      : {};
  return {
    allow: asStringArray(perms.allow),
    deny: asStringArray(perms.deny),
    ask: asStringArray(perms.ask),
  };
}

function parseEnv(obj: Record<string, unknown>): { key: string; value: string }[] {
  const env =
    obj.env && typeof obj.env === "object"
      ? (obj.env as Record<string, unknown>)
      : {};
  return Object.entries(env).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

function parseHooks(obj: Record<string, unknown>): HookSummary[] {
  const out: HookSummary[] = [];
  const hooks = obj.hooks;
  if (!hooks || typeof hooks !== "object") return out;
  for (const [event, matchers] of Object.entries(
    hooks as Record<string, unknown>,
  )) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      if (!matcher || typeof matcher !== "object") continue;
      const list = (matcher as Record<string, unknown>).hooks;
      if (!Array.isArray(list)) continue;
      for (const h of list) {
        if (h && typeof h === "object") {
          const cmd = (h as Record<string, unknown>).command;
          out.push({
            event,
            command: typeof cmd === "string" ? cmd : "(non-command hook)",
          });
        }
      }
    }
  }
  return out;
}

function parse(content: string): ParsedSettings | null {
  let obj: Record<string, unknown>;
  try {
    const raw: unknown = content.trim() ? JSON.parse(content) : {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    obj = raw as Record<string, unknown>;
  } catch {
    return null;
  }
  const { allow, deny, ask } = parsePermissions(obj);
  return { obj, allow, deny, ask, env: parseEnv(obj), hooks: parseHooks(obj) };
}

/** Serialize the form state back to a pretty JSON string. */
function serialize(state: ParsedSettings): string {
  const next: Record<string, unknown> = { ...state.obj };
  const permissions: Record<string, unknown> = {
    ...(next.permissions && typeof next.permissions === "object"
      ? (next.permissions as Record<string, unknown>)
      : {}),
  };
  permissions.allow = state.allow;
  permissions.deny = state.deny;
  permissions.ask = state.ask;
  next.permissions = permissions;
  next.env = Object.fromEntries(
    state.env.filter((e) => e.key.trim()).map((e) => [e.key, e.value]),
  );
  return JSON.stringify(next, null, 2) + "\n";
}

function StringListEditor({
  title,
  tone,
  items,
  onChange,
}: {
  title: string;
  tone: "allow" | "ask" | "deny";
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const dot =
    tone === "allow"
      ? "bg-status-ok"
      : tone === "deny"
        ? "bg-status-fail"
        : "bg-status-warn";
  function add() {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  }
  return (
    <div className="flex flex-col rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-2xs font-semibold uppercase tracking-widest text-fog-400">
          {title}
        </span>
        <span className="ml-auto font-mono text-2xs text-fog-500">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {items.length === 0 ? (
          <div className="px-1 py-1 text-xs text-fog-600">None</div>
        ) : (
          items.map((item, i) => (
            <div
              key={`${item}-${i}`}
              className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-850"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-fog-200"
                title={item}
              >
                {item}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="shrink-0 rounded px-1 text-fog-500 opacity-0 transition-opacity hover:text-status-fail group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))
        )}
        <div className="mt-1 flex items-center gap-1.5 border-t border-ink-800 pt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add rule…"
            className="h-8 font-mono text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button size="sm" variant="secondary" disabled={!draft.trim()} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingsForm({
  file,
  onSaved,
}: {
  file: ConfigFile;
  onSaved: (file: ConfigFile) => void;
}) {
  const toast = useToast();
  const initial = useMemo(() => parse(file.content), [file.content]);
  const [state, setState] = useState<ParsedSettings | null>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState(parse(file.content));
  }, [file.content]);

  if (!state) {
    return (
      <div className="p-4 text-sm text-status-warn">
        This file is not valid JSON. Edit it in the Raw JSON tab to fix it.
      </div>
    );
  }
  const s = state;

  async function save() {
    setSaving(true);
    try {
      const res: FileWriteResponse = await api.writeFile({
        path: file.path,
        content: serialize(s),
      });
      onSaved(res.file);
      toast.push("Settings saved.", "ok");
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Save failed", "fail");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
        <div className="font-mono text-xs text-fog-400">{file.displayPath}</div>
        <Button
          size="sm"
          variant="primary"
          onClick={save}
          disabled={saving || !file.editable}
        >
          {saving ? "Saving" : "Save"}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <section>
            <div className="mb-2 text-sm font-semibold text-fog-50">
              Permissions
            </div>
            <p className="mb-3 text-xs text-fog-500">
              Rules that allow, prompt for, or block tool use. Hover a rule to remove it.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StringListEditor
                title="Allow"
                tone="allow"
                items={s.allow}
                onChange={(allow) => setState({ ...s, allow })}
              />
              <StringListEditor
                title="Ask"
                tone="ask"
                items={s.ask}
                onChange={(ask) => setState({ ...s, ask })}
              />
              <StringListEditor
                title="Deny"
                tone="deny"
                items={s.deny}
                onChange={(deny) => setState({ ...s, deny })}
              />
            </div>
          </section>

          <section>
            <div className="mb-2 text-sm font-semibold text-fog-50">
              Environment
            </div>
            <div className="space-y-1.5">
              {s.env.length === 0 ? (
                <div className="text-xs text-fog-600">No env vars</div>
              ) : (
                s.env.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => {
                        const env = [...s.env];
                        env[i] = { ...row, key: e.target.value };
                        setState({ ...s, env });
                      }}
                      placeholder="KEY"
                      className="font-mono text-xs"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => {
                        const env = [...s.env];
                        env[i] = { ...row, value: e.target.value };
                        setState({ ...s, env });
                      }}
                      placeholder="value"
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setState({
                          ...s,
                          env: s.env.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setState({ ...s, env: [...s.env, { key: "", value: "" }] })
                }
              >
                Add variable
              </Button>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fog-50">
              Hooks
              <Badge tone="outline">read only</Badge>
              <span className="ml-auto text-2xs text-fog-600">
                Edit in Raw JSON
              </span>
            </div>
            {s.hooks.length === 0 ? (
              <div className="text-xs text-fog-600">No hooks configured</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
                <ScrollArea className="max-h-72">
                  <ul className="divide-y divide-ink-800">
                    {s.hooks.map((h, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 px-3 py-1.5 hover:bg-ink-850"
                      >
                        <span className="w-36 shrink-0 font-mono text-2xs uppercase tracking-wide text-fog-500">
                          {h.event}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-2xs text-fog-300"
                          title={h.command}
                        >
                          {h.command}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function RawEditor({
  file,
  onSaved,
}: {
  file: ConfigFile;
  onSaved: (file: ConfigFile) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(file.content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(file.content);
  }, [file.content, file.path]);

  const dirty = value !== file.content;

  async function save() {
    setSaving(true);
    try {
      const res = await api.writeFile({ path: file.path, content: value });
      onSaved(res.file);
      toast.push("Settings saved.", "ok");
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Save failed", "fail");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
        <div className="font-mono text-xs text-fog-400">{file.displayPath}</div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge tone="warn">unsaved</Badge> : null}
          <Button
            size="sm"
            variant="primary"
            onClick={save}
            disabled={!dirty || saving || !file.editable}
          >
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-t border-ink-700 bg-ink-900">
        <CodeMirror
          value={value}
          onChange={setValue}
          theme="light"
          extensions={[json()]}
          editable={file.editable}
          height="100%"
          style={{ height: "100%" }}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
        />
      </div>
    </div>
  );
}

export function SettingsView() {
  const { data, loading, error, reload, setData } = useAsync(api.getSettings);
  const [fileTab, setFileTab] = useState<FileTab>("settings");
  const [mode, setMode] = useState<Mode>("form");

  if (loading && !data) return <LoadingState label="Reading settings" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No settings found.</EmptyState>;

  const active: ConfigFile =
    fileTab === "local" && data.local ? data.local : data.settings;

  function handleSaved(updated: ConfigFile) {
    if (!data) return;
    if (data.local && updated.path === data.local.path) {
      setData({ ...data, local: updated });
    } else {
      setData({ ...data, settings: updated });
    }
  }

  const fileTabs: { id: FileTab; label: string; available: boolean }[] = [
    { id: "settings", label: "settings.json", available: true },
    {
      id: "local",
      label: "settings.local.json",
      available: data.local != null,
    },
  ];

  const modeTabs: { id: Mode; label: string }[] = [
    { id: "form", label: "Form" },
    { id: "raw", label: "Raw JSON" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {fileTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!t.available}
              onClick={() => setFileTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 font-mono text-xs transition-colors",
                !t.available && "cursor-not-allowed opacity-40",
                fileTab === t.id && t.available
                  ? "bg-ink-750 text-fog-50"
                  : "text-fog-400 hover:text-fog-100",
              )}
            >
              {t.label}
              {t.id === "local" && !t.available ? " · not present" : ""}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {modeTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                mode === t.id
                  ? "bg-ink-750 text-fog-50"
                  : "text-fog-400 hover:text-fog-100",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
        {mode === "form" ? (
          <SettingsForm key={active.path} file={active} onSaved={handleSaved} />
        ) : (
          <RawEditor key={active.path} file={active} onSaved={handleSaved} />
        )}
      </div>
    </div>
  );
}
