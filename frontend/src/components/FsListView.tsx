import { useEffect, useMemo, useState } from "react";
import type { ConfigFile, FsKind } from "@shared/contracts";
import { api } from "@/api/client";
import { useToast } from "@/components/ui/Toast";
import { useNavigation } from "@/lib/navigation";
import { formatBytes } from "@/lib/format";
import { FileEditor } from "@/components/FileEditor";
import { MasterDetail } from "@/components/MasterDetail";
import type { ListEntry } from "@/components/MasterDetail";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

/** A group of files; only `creatable`/`editable` groups get CRUD affordances. */
export interface FsGroup {
  heading: string;
  files: ConfigFile[];
  /** Files in this group support rename/delete. */
  mutable?: boolean;
}

interface FsListViewProps {
  groups: FsGroup[];
  /** kind passed to fs/create; if omitted, "New" is hidden. */
  createKind?: FsKind;
  createLabel?: string;
  /** Re-fetch the underlying data after a mutation. */
  onReload: () => void;
  /** Patch a single saved file back into local state (optimistic). */
  onSaved: (file: ConfigFile) => void;
}

export function FsListView({
  groups,
  createKind,
  createLabel = "New",
  onReload,
  onSaved,
}: FsListViewProps) {
  const toast = useToast();
  const { pendingSelect, consumePendingSelect } = useNavigation();
  const [selected, setSelected] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ConfigFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConfigFile | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [busy, setBusy] = useState(false);

  const files = useMemo<Record<string, ConfigFile>>(() => {
    const map: Record<string, ConfigFile> = {};
    for (const g of groups) for (const f of g.files) map[f.path] = f;
    return map;
  }, [groups]);

  const mutablePaths = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const g of groups)
      if (g.mutable) for (const f of g.files) set.add(f.path);
    return set;
  }, [groups]);

  const firstPath = groups.flatMap((g) => g.files)[0]?.path ?? null;

  useEffect(() => {
    if (selected === null && firstPath) setSelected(firstPath);
  }, [firstPath, selected]);

  // Honor cross-surface navigation requests (e.g. from the graph).
  useEffect(() => {
    if (pendingSelect && files[pendingSelect]) {
      setSelected(pendingSelect);
      consumePendingSelect();
    }
  }, [pendingSelect, files, consumePendingSelect]);

  const toEntry = (f: ConfigFile): ListEntry => ({
    key: f.path,
    label: f.label,
    subLabel: f.displayPath,
    meta: f.exists ? formatBytes(f.bytes) : "missing",
  });

  const navGroups = groups.map((g) => ({
    heading: `${g.heading} (${g.files.length})`,
    entries: g.files.map(toEntry),
  }));

  const current = selected ? files[selected] : undefined;
  const currentMutable = current ? mutablePaths.has(current.path) : false;

  async function doCreate() {
    if (!createKind || !createName.trim()) return;
    setBusy(true);
    try {
      await api.fsCreate({ kind: createKind, name: createName.trim(), content: "" });
      toast.push("Created.", "ok");
      setCreating(false);
      setCreateName("");
      onReload();
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Create failed",
        "fail",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doRename() {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true);
    try {
      await api.fsRename({
        path: renameTarget.path,
        newName: renameValue.trim(),
      });
      toast.push("Renamed.", "ok");
      setRenameTarget(null);
      setSelected(null);
      onReload();
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Rename failed",
        "fail",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.fsDelete({ path: deleteTarget.path });
      toast.push("Deleted (moved to trash).", "ok");
      setDeleteTarget(null);
      setSelected(null);
      onReload();
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Delete failed",
        "fail",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {createKind ? (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            {createLabel}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MasterDetail
          groups={navGroups}
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
                  <FileEditor
                    key={current.path}
                    file={current}
                    onSaved={onSaved}
                  />
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
        title={createLabel}
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRenameTarget(null)}
            >
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={doDelete}
              disabled={busy}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fog-300">
          Move{" "}
          <span className="font-mono text-fog-100">
            {deleteTarget?.label}
          </span>{" "}
          to trash? This is reversible.
        </p>
      </Modal>
    </div>
  );
}
