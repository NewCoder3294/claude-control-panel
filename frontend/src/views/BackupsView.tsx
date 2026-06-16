import { useMemo, useState } from "react";
import type { BackupEntry } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Modal } from "@/components/ui/Modal";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

function formatWhen(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export function BackupsView() {
  const { data, loading, error, reload } = useAsync(api.getBackups);
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<BackupEntry | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const sorted = useMemo<BackupEntry[]>(() => {
    if (!data) return [];
    const list = [...data.backups].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
    const q = filter.trim().toLowerCase();
    return q
      ? list.filter((b) =>
          b.displayOriginalPath.toLowerCase().includes(q),
        )
      : list;
  }, [data, filter]);

  if (loading && !data) return <LoadingState label="Reading backups" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No backups directory found.</EmptyState>;
  if (data.backups.length === 0)
    return (
      <EmptyState>
        No restore points yet. A timestamped backup is saved automatically before
        any file edit, skill archive, or settings change, then shows up here ready
        to restore in one click.
      </EmptyState>
    );

  async function restore(entry: BackupEntry) {
    setConfirm(null);
    setRestoring(entry.backupPath);
    try {
      await api.restoreBackup({
        backupPath: entry.backupPath,
        originalPath: entry.originalPath,
      });
      toast.push("Restored from backup.", "ok");
      reload();
    } catch (cause) {
      toast.push(
        cause instanceof Error ? cause.message : "Restore failed",
        "fail",
      );
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by path…"
          className="max-w-xs"
        />
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xs text-fog-500">
            {sorted.length} of {data.backups.length}
          </span>
          <Button size="sm" variant="ghost" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border border-ink-700 bg-ink-850">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-ink-800/95 backdrop-blur">
            <tr className="text-left text-2xs uppercase tracking-widest text-fog-500">
              <th className="px-4 py-2.5 font-semibold">Original path</th>
              <th className="px-4 py-2.5 font-semibold">When</th>
              <th className="px-4 py-2.5 font-semibold">Size</th>
              <th className="px-4 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {sorted.map((b) => {
              const busy = restoring === b.backupPath;
              return (
                <tr
                  key={b.backupPath}
                  className={busy ? "opacity-60" : undefined}
                >
                  <td className="max-w-md px-4 py-3 font-mono text-xs text-fog-100">
                    <span
                      className="block truncate"
                      title={b.displayOriginalPath}
                    >
                      {b.displayOriginalPath}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fog-400">
                    {formatWhen(b.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fog-400">
                    {formatBytes(b.bytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirm(b)}
                    >
                      {busy ? "Restoring" : "Restore"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>

      <Modal
        open={confirm != null}
        title="Restore backup"
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => confirm && restore(confirm)}
            >
              Restore
            </Button>
          </>
        }
      >
        <p className="text-sm text-fog-300">
          Overwrite{" "}
          <span className="font-mono text-fog-100">
            {confirm?.displayOriginalPath}
          </span>{" "}
          with the version from {confirm ? formatWhen(confirm.timestamp) : ""}?
          The current file will itself be backed up first.
        </p>
      </Modal>
    </div>
  );
}
