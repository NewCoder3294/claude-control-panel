import type { ConfigFile } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { FsListView } from "@/components/FsListView";
import type { FsGroup } from "@/components/FsListView";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

export function MemoryView() {
  const { data, loading, error, reload, setData } = useAsync(api.getMemory);

  if (loading && !data) return <LoadingState label="Reading memory" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No memory directory found.</EmptyState>;

  const groups: FsGroup[] = [
    { heading: "Index", files: data.index ? [data.index] : [] },
    { heading: "Memory files", files: data.files, mutable: true },
  ];

  function handleSaved(updated: ConfigFile) {
    if (!data) return;
    setData({
      ...data,
      index:
        data.index && data.index.path === updated.path ? updated : data.index,
      files: data.files.map((f) => (f.path === updated.path ? updated : f)),
    });
  }

  return (
    <FsListView
      groups={groups}
      createKind="memory"
      createLabel="New memory"
      onReload={reload}
      onSaved={handleSaved}
    />
  );
}
