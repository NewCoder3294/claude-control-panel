import { lazy, Suspense, useMemo, useState } from "react";
import type { GraphNode, GraphNodeType } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useNavigation } from "@/lib/navigation";
import type { SurfaceId } from "@/nav";
import { NODE_TYPE_COLOR, NODE_TYPE_LABEL } from "@/lib/graphStyle";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { LoadingState, ErrorState, EmptyState } from "@/components/ViewState";

// cytoscape is heavy (~350 KB); only load it when the graph is opened.
const GraphCanvas = lazy(() =>
  import("@/components/GraphCanvas").then((m) => ({ default: m.GraphCanvas })),
);

const SURFACE_IDS: SurfaceId[] = [
  "instructions",
  "memory",
  "mcp",
  "skills",
  "commands",
  "agents",
  "settings",
  "context-map",
  "backups",
  "gbrain",
];

function isSurfaceId(value: string): value is SurfaceId {
  return (SURFACE_IDS as string[]).includes(value);
}

export function ContextMapView() {
  const { data, loading, error, reload } = useAsync(api.getGraph);
  const { navigate } = useNavigation();
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const presentTypes = useMemo<GraphNodeType[]>(() => {
    if (!data) return [];
    const set = new Set<GraphNodeType>();
    for (const n of data.nodes) set.add(n.type);
    return (Object.keys(NODE_TYPE_LABEL) as GraphNodeType[]).filter((t) =>
      set.has(t),
    );
  }, [data]);

  if (loading && !data)
    return <LoadingState label="Building knowledge graph" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.nodes.length === 0)
    return <EmptyState>No graph nodes reported.</EmptyState>;

  function handleNodeClick(node: GraphNode) {
    setSelected(node);
  }

  function openSelected() {
    if (!selected?.surface) return;
    if (isSurfaceId(selected.surface)) {
      navigate(selected.surface, selected.path ?? undefined);
    }
  }

  const startupCount = data.nodes.filter((n) => n.group === "startup").length;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      {/* Top stats bar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-900/70 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3 font-mono text-2xs text-fog-500">
          <span>{data.nodes.length} nodes</span>
          <span className="text-fog-600">·</span>
          <span>{data.edges.length} edges</span>
          <span className="text-fog-600">·</span>
          <span className="text-status-ok">{startupCount} at startup</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-2xs uppercase tracking-widest text-fog-600 sm:inline">
            Drag to pan · scroll to zoom · click a node
          </span>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-ink-600 px-2 py-1 text-2xs text-fog-400 transition-colors hover:bg-ink-800 hover:text-fog-100"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner label="Loading graph engine" />
            </div>
          }
        >
          <GraphCanvas graph={data} onNodeClick={handleNodeClick} />
        </Suspense>

        {/* Legend */}
        <div className="absolute left-3 top-3 max-w-[200px] rounded-md border border-ink-700 bg-ink-850/90 p-2.5 backdrop-blur">
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-widest text-fog-500">
            Legend
          </div>
          <ul className="space-y-1">
            {presentTypes.map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs text-fog-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: NODE_TYPE_COLOR[t] }}
                />
                {NODE_TYPE_LABEL[t]}
              </li>
            ))}
          </ul>
        </div>

        {/* Selected node inspector */}
        {selected ? (
          <div className="absolute bottom-3 right-3 w-72 rounded-md border border-ink-700 bg-ink-850/95 p-3 shadow-panel backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-fog-50">
                  {selected.label}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: NODE_TYPE_COLOR[selected.type] }}
                  />
                  <span className="text-2xs uppercase tracking-wide text-fog-500">
                    {NODE_TYPE_LABEL[selected.type]}
                  </span>
                  <Badge tone={selected.group === "startup" ? "ok" : "outline"}>
                    {selected.group}
                  </Badge>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 text-fog-500 hover:text-fog-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {selected.path ? (
              <div className="mt-2 break-all font-mono text-2xs text-fog-500">
                {selected.path}
              </div>
            ) : null}
            {selected.surface && isSurfaceId(selected.surface) ? (
              <button
                type="button"
                onClick={openSelected}
                className="mt-3 w-full rounded-md border border-ink-600 bg-ink-750 px-2.5 py-1.5 text-xs text-fog-100 transition-colors hover:bg-ink-700"
              >
                Open in {selected.surface}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
