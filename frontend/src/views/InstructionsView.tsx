import type { ConfigFile } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { FsListView } from "@/components/FsListView";
import type { FsGroup } from "@/components/FsListView";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

export function InstructionsView() {
  const { data, loading, error, reload, setData } = useAsync(
    api.getInstructions,
  );

  if (loading && !data) return <LoadingState label="Reading instructions" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState>No instructions found.</EmptyState>;

  const groups: FsGroup[] = [
    { heading: "Global", files: [data.global] },
    { heading: "Projects", files: data.projects },
    { heading: "Rules", files: data.rules, mutable: true },
  ];

  function handleSaved(updated: ConfigFile) {
    if (!data) return;
    setData({
      global: data.global.path === updated.path ? updated : data.global,
      projects: data.projects.map((f) =>
        f.path === updated.path ? updated : f,
      ),
      rules: data.rules.map((f) => (f.path === updated.path ? updated : f)),
    });
  }

  return (
    <FsListView
      groups={groups}
      createKind="rule"
      createLabel="New rule"
      onReload={reload}
      onSaved={handleSaved}
    />
  );
}
