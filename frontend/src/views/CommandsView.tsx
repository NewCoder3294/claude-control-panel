import type { ConfigFile } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { FsListView } from "@/components/FsListView";
import type { FsGroup } from "@/components/FsListView";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

export function CommandsView() {
  const { data, loading, error, reload, setData } = useAsync(api.getCommands);

  if (loading && !data) return <LoadingState label="Reading commands" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No commands found.</EmptyState>;

  const groups: FsGroup[] = [
    { heading: "Commands", files: data.commands, mutable: true },
  ];

  function handleSaved(updated: ConfigFile) {
    if (!data) return;
    setData({
      commands: data.commands.map((f) =>
        f.path === updated.path ? updated : f,
      ),
    });
  }

  return (
    <FsListView
      groups={groups}
      createKind="command"
      createLabel="New command"
      onReload={reload}
      onSaved={handleSaved}
    />
  );
}
