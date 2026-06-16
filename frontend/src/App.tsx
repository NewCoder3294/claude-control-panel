import { useCallback, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NAV_ITEMS, PROJECT_SURFACES } from "@/nav";
import type { ProjectRouteSurface, Route, SurfaceId } from "@/nav";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useCounts } from "@/lib/useCounts";
import { ToastProvider } from "@/components/ui/Toast";
import { NavigationProvider } from "@/lib/navigation";
import { InstructionsView } from "@/views/InstructionsView";
import { MemoryView } from "@/views/MemoryView";
import { McpView } from "@/views/McpView";
import { SkillsView } from "@/views/SkillsView";
import { CommandsView } from "@/views/CommandsView";
import { AgentsView } from "@/views/AgentsView";
import { SettingsView } from "@/views/SettingsView";
import { ContextMapView } from "@/views/ContextMapView";
import { BackupsView } from "@/views/BackupsView";
import { GbrainView } from "@/views/GbrainView";
import { ProjectView } from "@/views/ProjectView";
import { CodeTrustView } from "@/views/CodeTrustView";

const VIEWS: Record<SurfaceId, () => JSX.Element> = {
  instructions: InstructionsView,
  memory: MemoryView,
  mcp: McpView,
  skills: SkillsView,
  commands: CommandsView,
  agents: AgentsView,
  settings: SettingsView,
  "context-map": ContextMapView,
  backups: BackupsView,
  gbrain: GbrainView,
  "code-trust": CodeTrustView,
};

const SUBTITLES: Record<SurfaceId, string> = {
  instructions:
    "Global and project CLAUDE.md plus rule files Claude loads each session.",
  memory: "Persistent memory index and notes carried across sessions.",
  mcp: "Configured MCP servers with live connection status.",
  skills: "Active and archived skills. Archiving is reversible.",
  commands: "Custom slash commands available to Claude Code.",
  agents: "Subagent specifications: tools, model, and system prompt.",
  settings:
    "settings.json and settings.local.json. Saves are validated and backed up.",
  "context-map": "Interactive knowledge graph of everything Claude can load.",
  backups: "Restore any file from an automatic backup snapshot.",
  gbrain: "Session memory: status, search, sync, and hook controls.",
  "code-trust":
    "Trust-HUD fixes for AI-written code, by project. Review and apply.",
};

export default function App() {
  const [route, setRoute] = useState<Route>({
    kind: "global",
    surface: "instructions",
  });
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  const counts = useCounts();
  const projectsState = useAsync(api.getProjects);
  const projects = projectsState.data?.projects ?? [];

  const navigate = useCallback((surface: SurfaceId, selectPath?: string) => {
    setRoute({ kind: "global", surface });
    setPendingSelect(selectPath ?? null);
  }, []);

  const consumePendingSelect = useCallback(() => setPendingSelect(null), []);

  let title: string;
  let subtitle: string;
  let body: JSX.Element;

  if (route.kind === "global") {
    const meta = NAV_ITEMS.find((n) => n.id === route.surface);
    const ActiveView = VIEWS[route.surface];
    title = meta?.label ?? "Claude Code Control Panel";
    subtitle = SUBTITLES[route.surface];
    body = <ActiveView />;
  } else {
    const project = projects.find((p) => p.slug === route.slug);
    const surfaceMeta = PROJECT_SURFACES.find((s) => s.id === route.surface);
    title = `${project?.name ?? "Project"} · ${surfaceMeta?.label ?? ""}`;
    subtitle = project
      ? project.displayPath
      : "Project-scoped Claude Code configuration.";
    body = (
      <ProjectView
        key={route.slug}
        slug={route.slug}
        surface={route.surface}
        onNavigateSurface={(surface: ProjectRouteSurface) =>
          setRoute({ kind: "project", slug: route.slug, surface })
        }
      />
    );
  }

  return (
    <ToastProvider>
      <NavigationProvider
        value={{ navigate, pendingSelect, consumePendingSelect }}
      >
        <div className="console-grid flex h-screen w-screen overflow-hidden bg-ink-950">
          <Sidebar
            route={route}
            onNavigate={setRoute}
            counts={counts}
            projects={projects}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-900/80 px-6 backdrop-blur">
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-semibold tracking-tight text-fog-50">
                  {title}
                </h1>
                <p className="mt-0.5 truncate text-sm text-fog-400">
                  {subtitle}
                </p>
              </div>
              <div className="hidden shrink-0 text-right text-2xs uppercase tracking-widest text-fog-500 sm:block">
                Claude Code · Control Panel
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-hidden p-6">
              <div className="h-full animate-fade-in">{body}</div>
            </main>
          </div>
        </div>
      </NavigationProvider>
    </ToastProvider>
  );
}
