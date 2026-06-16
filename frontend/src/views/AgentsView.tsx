import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { AgentSpec, AgentWriteRequest } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { MasterDetail } from "@/components/MasterDetail";
import type { ListEntry } from "@/components/MasterDetail";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

const MODEL_OPTIONS = ["", "inherit", "sonnet", "opus", "haiku", "fable"];

const NEW_KEY = "__new__";

interface Draft {
  originalName: string; // "" for create
  name: string;
  description: string;
  tools: string;
  model: string;
  prompt: string;
}

function draftFromSpec(s: AgentSpec): Draft {
  return {
    originalName: s.name,
    name: s.name,
    description: s.description,
    tools: s.tools,
    model: s.model,
    prompt: s.prompt,
  };
}

const BLANK_DRAFT: Draft = {
  originalName: "",
  name: "",
  description: "",
  tools: "*",
  model: "",
  prompt: "You are a focused subagent.\n\n",
};

export function AgentsView() {
  const { data, loading, error, reload, setData } = useAsync(api.getAgents);
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AgentSpec | null>(null);

  const byName = useMemo<Record<string, AgentSpec>>(() => {
    if (!data) return {};
    return Object.fromEntries(data.agents.map((a) => [a.name, a]));
  }, [data]);

  useEffect(() => {
    if (data && selected === null && data.agents.length > 0) {
      const first = data.agents[0];
      setSelected(first.name);
      setDraft(draftFromSpec(first));
    }
  }, [data, selected]);

  if (loading && !data) return <LoadingState label="Reading agents" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No agents directory found.</EmptyState>;

  function selectAgent(name: string) {
    setSelected(name);
    if (name === NEW_KEY) {
      setDraft({ ...BLANK_DRAFT });
    } else {
      const spec = byName[name];
      if (spec) setDraft(draftFromSpec(spec));
    }
  }

  function startNew() {
    setSelected(NEW_KEY);
    setDraft({ ...BLANK_DRAFT });
  }

  function cloneCurrent() {
    if (!draft) return;
    setSelected(NEW_KEY);
    setDraft({
      ...draft,
      originalName: "",
      name: draft.name ? `${draft.name}-copy` : "",
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.push("Agent name is required.", "fail");
      return;
    }
    setSaving(true);
    const req: AgentWriteRequest = {
      originalName: draft.originalName || undefined,
      name: draft.name.trim(),
      description: draft.description,
      tools: draft.tools,
      model: draft.model,
      prompt: draft.prompt,
    };
    try {
      const next = await api.writeAgent(req);
      setData(next);
      setSelected(req.name);
      const saved = next.agents.find((a) => a.name === req.name);
      if (saved) setDraft(draftFromSpec(saved));
      toast.push("Agent saved.", "ok");
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Save failed", "fail");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(spec: AgentSpec) {
    setConfirmDelete(null);
    try {
      await api.fsDelete({ path: spec.path });
      toast.push("Agent deleted (moved to trash).", "ok");
      setSelected(null);
      setDraft(null);
      reload();
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Delete failed",
        "fail",
      );
    }
  }

  const toEntry = (a: AgentSpec): ListEntry => ({
    key: a.name,
    label: a.name,
    subLabel: a.description || a.displayPath,
    meta: a.model || undefined,
  });

  const groups = [
    {
      heading: `Agents (${data.agents.length})`,
      entries: [
        ...(selected === NEW_KEY
          ? [{ key: NEW_KEY, label: "New agent", subLabel: "unsaved" }]
          : []),
        ...data.agents.map(toEntry),
      ],
    },
  ];

  const currentSpec = selected && selected !== NEW_KEY ? byName[selected] : null;
  const isNew = selected === NEW_KEY;
  const dirty =
    draft != null &&
    (isNew ||
      (currentSpec != null &&
        (draft.name !== currentSpec.name ||
          draft.description !== currentSpec.description ||
          draft.tools !== currentSpec.tools ||
          draft.model !== currentSpec.model ||
          draft.prompt !== currentSpec.prompt)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-2xs text-fog-500">{data.displayDir}</div>
        <Button size="sm" variant="secondary" onClick={startNew}>
          New agent
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <MasterDetail
          groups={groups}
          selectedKey={selected}
          onSelect={selectAgent}
          detail={
            draft ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fog-100">
                      {isNew ? "New agent" : draft.name}
                    </div>
                    <div className="truncate font-mono text-xs text-fog-400">
                      {currentSpec?.displayPath ?? "will be created on save"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {dirty ? <Badge tone="warn">unsaved</Badge> : null}
                    <Button size="sm" variant="ghost" onClick={cloneCurrent}>
                      Clone
                    </Button>
                    {currentSpec ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDelete(currentSpec)}
                      >
                        Delete
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={save}
                      disabled={saving || !dirty}
                    >
                      {saving ? "Saving" : "Save"}
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block">
                      <Label>Name</Label>
                      <Input
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        placeholder="my-agent"
                      />
                    </label>
                    <label className="block">
                      <Label>Model</Label>
                      <Select
                        value={draft.model}
                        onChange={(e) =>
                          setDraft({ ...draft, model: e.target.value })
                        }
                      >
                        {MODEL_OPTIONS.map((m) => (
                          <option key={m || "unset"} value={m}>
                            {m === "" ? "(unset)" : m}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <Label>Description</Label>
                    <Input
                      value={draft.description}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      placeholder="When to use this agent"
                    />
                  </label>

                  <label className="mt-3 block">
                    <Label>Tools</Label>
                    <Input
                      value={draft.tools}
                      onChange={(e) =>
                        setDraft({ ...draft, tools: e.target.value })
                      }
                      placeholder='"*" or comma list (Read, Edit, Bash)'
                    />
                  </label>

                  <div className="mt-3">
                    <Label>System prompt</Label>
                    <div className="overflow-hidden rounded-md border border-ink-600">
                      <CodeMirror
                        value={draft.prompt}
                        onChange={(v) => setDraft({ ...draft, prompt: v })}
                        theme="light"
                        extensions={[markdown()]}
                        height="320px"
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState>Select an agent or create a new one.</EmptyState>
            )
          }
        />
      </div>

      <Modal
        open={confirmDelete != null}
        title="Delete agent"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => confirmDelete && doDelete(confirmDelete)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fog-300">
          Move{" "}
          <span className="font-mono text-fog-100">{confirmDelete?.name}</span>{" "}
          to trash? This is reversible from the filesystem.
        </p>
      </Modal>
    </div>
  );
}
