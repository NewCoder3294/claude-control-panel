import { useCallback, useEffect, useState } from "react";
import type {
  ConfigFile,
  ProjectDetail,
  ProjectFileGroup,
} from "@shared/contracts";
import { api } from "@/api/client";
import { invalidate } from "@/lib/queryCache";
import { useAsync } from "@/lib/useAsync";
import { formatBytes } from "@/lib/format";
import type { ProjectRouteSurface } from "@/nav";
import { PROJECT_SURFACES } from "@/nav";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";
import { MasterDetail } from "@/components/MasterDetail";
import type { ListEntry } from "@/components/MasterDetail";
import { FileEditor } from "@/components/FileEditor";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface ProjectViewProps {
  slug: string;
  surface: ProjectRouteSurface;
  onNavigateSurface: (surface: ProjectRouteSurface) => void;
}

/** Singular noun for the "New …" affordance, per named surface. */
const SINGULAR: Record<string, string> = {
  commands: "command",
  agents: "agent",
  rules: "rule",
  memory: "note",
};

export function ProjectView({
  slug,
  surface,
  onNavigateSurface,
}: ProjectViewProps) {
  // Keyed by slug at the call site, so this inline fetcher is stable per mount.
  const fetcher = useCallback(() => api.getProjectDetail(slug), [slug]);
  const { data, loading, error, reload, setData } = useAsync(fetcher);

  if (loading && !data) return <LoadingState label="Reading project" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No project data.</EmptyState>;

  if (surface === "overview") {
    return <Overview detail={data} onNavigateSurface={onNavigateSurface} />;
  }

  const group = data.groups.find((g) => g.surface === surface);
  if (!group) return <EmptyState>This surface is unavailable.</EmptyState>;

  const handleSaved = (updated: ConfigFile) => {
    // Did a previously-missing file just get created? If so the project's
    // configKinds changed — refresh the projects list so the sidebar
    // content-dots and Overview reflect it.
    const prior = data.groups
      .flatMap((g) => g.files)
      .find((f) => f.path === updated.path);
    const becameCreated = prior?.exists === false && updated.exists;

    setData({
      ...data,
      groups: data.groups.map((g) => ({
        ...g,
        files: g.files.map((f) => (f.path === updated.path ? updated : f)),
      })),
    });

    if (becameCreated) invalidate(api.getProjects);
  };

  return (
    <SurfacePanel
      slug={slug}
      group={group}
      onReload={reload}
      onSaved={handleSaved}
    />
  );
}

/* ---------------------------------------------------------------- Overview */

function Overview({
  detail,
  onNavigateSurface,
}: {
  detail: ProjectDetail;
  onNavigateSurface: (surface: ProjectRouteSurface) => void;
}) {
  const configSurfaces = PROJECT_SURFACES.filter((s) => s.id !== "overview");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-lg border border-ink-700 bg-ink-850 p-5">
          <div className="font-display text-lg font-semibold text-fog-50">
            {detail.name}
          </div>
          <div className="mt-1 font-mono text-xs text-fog-400">
            {detail.displayPath}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Stat label="Sessions" value={String(detail.sessionCount)} />
            <Stat
              label="Last active"
              value={
                detail.lastActive
                  ? new Date(detail.lastActive).toLocaleString()
                  : "—"
              }
            />
            <Stat label="Slug" value={detail.slug} mono />
          </div>
        </section>

        <section>
          <div className="mb-2 px-1 text-2xs font-semibold uppercase tracking-widest text-fog-500">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {configSurfaces.map((s) => {
              const group = detail.groups.find((g) => g.surface === s.id);
              const present = group?.files.filter((f) => f.exists).length ?? 0;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onNavigateSurface(s.id)}
                  className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-3 text-left transition-colors hover:border-ink-600 hover:bg-ink-800"
                >
                  <span className="shrink-0 text-fog-400">
                    <Icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fog-100">
                      {s.label}
                    </span>
                    <span className="block text-2xs text-fog-500">
                      {present > 0
                        ? `${present} file${present === 1 ? "" : "s"}`
                        : "Not configured"}
                    </span>
                  </span>
                  {present > 0 ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-ok" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-fog-500">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs text-fog-200" : "text-fog-100"}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ SurfacePanel */

interface SurfacePanelProps {
  slug: string;
  group: ProjectFileGroup;
  onReload: () => void;
  onSaved: (file: ConfigFile) => void;
}

function SurfacePanel({ slug, group, onReload, onSaved }: SurfacePanelProps) {
  const toast = useToast();
  const named = group.createMode === "named";
  const singular = SINGULAR[group.surface] ?? "file";

  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameTarget, setRenameTarget] = useState<ConfigFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConfigFile | null>(null);
  const [busy, setBusy] = useState(false);

  const firstPath = group.files[0]?.path ?? null;
  useEffect(() => {
    if (selected === null && firstPath) setSelected(firstPath);
  }, [firstPath, selected]);

  const current = group.files.find((f) => f.path === selected);

  const entries: ListEntry[] = group.files.map((f) => ({
    key: f.path,
    label: f.label,
    subLabel: f.displayPath,
    meta: f.exists ? formatBytes(f.bytes) : "new",
  }));

  async function doCreate() {
    const name = createName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.projectFileCreate({ slug, surface: group.surface, name });
      toast.push("Created.", "ok");
      setCreating(false);
      setCreateName("");
      onReload();
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Create failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  async function doRename() {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true);
    try {
      await api.projectFileRename({
        path: renameTarget.path,
        newName: renameValue.trim(),
      });
      toast.push("Renamed.", "ok");
      setRenameTarget(null);
      setSelected(null);
      onReload();
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Rename failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.projectFileDelete({ path: deleteTarget.path });
      toast.push("Deleted (moved to trash).", "ok");
      setDeleteTarget(null);
      setSelected(null);
      onReload();
    } catch (cause) {
      toast.push(cause instanceof Error ? cause.message : "Delete failed", "fail");
    } finally {
      setBusy(false);
    }
  }

  // Rename/delete only apply to existing named files.
  const currentMutable = named && !!current?.exists;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        {named ? (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            New {singular}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onReload}>
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <MasterDetail
          groups={[{ heading: `${group.label} (${group.files.length})`, entries }]}
          selectedKey={selected}
          onSelect={setSelected}
          detail={
            current ? (
              <div className="flex h-full min-h-0 flex-col">
                {currentMutable ? (
                  <div className="flex items-center justify-end gap-2 border-b border-ink-700 px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenameTarget(current);
                        setRenameValue("");
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDeleteTarget(current)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <FileEditor key={current.path} file={current} onSaved={onSaved} />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-fog-400">
                Select a file to view it.
              </div>
            )
          }
        />
      </div>

      <Modal
        open={creating}
        title={`New ${singular}`}
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={doCreate}
              disabled={busy || !createName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <label className="block">
          <Label>Name</Label>
          <Input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="base-name (no extension)"
            onKeyDown={(e) => {
              if (e.key === "Enter") void doCreate();
            }}
          />
        </label>
      </Modal>

      <Modal
        open={renameTarget != null}
        title="Rename"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={doRename}
              disabled={busy || !renameValue.trim()}
            >
              Rename
            </Button>
          </>
        }
      >
        <p className="mb-2 truncate font-mono text-xs text-fog-500">
          {renameTarget?.displayPath}
        </p>
        <label className="block">
          <Label>New name</Label>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="new-base-name (no extension)"
            onKeyDown={(e) => {
              if (e.key === "Enter") void doRename();
            }}
          />
        </label>
      </Modal>

      <Modal
        open={deleteTarget != null}
        title="Delete"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={doDelete} disabled={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fog-300">
          Move{" "}
          <span className="font-mono text-fog-100">{deleteTarget?.label}</span> to
          trash? This is reversible.
        </p>
      </Modal>
    </div>
  );
}
