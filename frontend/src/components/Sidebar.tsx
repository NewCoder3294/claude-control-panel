import { useEffect, useState } from "react";
import type { ProjectSummary } from "@shared/contracts";
import { cn } from "@/lib/cn";
import { ChevronIcon, LogoMark } from "@/components/icons";
import { NAV_GROUPS, PROJECT_SURFACES } from "@/nav";
import type { NavItem, Route, SurfaceId } from "@/nav";

interface SidebarProps {
  route: Route;
  onNavigate: (route: Route) => void;
  /** Per-surface count badges; undefined => no badge (e.g. still loading). */
  counts: Partial<Record<SurfaceId, number>>;
  /** Discovered projects for the workspace switcher. */
  projects: ProjectSummary[];
}

const COLLAPSED_KEY = "ccp.sidebar.collapsed";
const PROJECT_KEY = "ccp.sidebar.project";

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function Sidebar({ route, onNavigate, counts, projects }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    readCollapsed,
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PROJECT_KEY);
    } catch {
      return null;
    }
  });

  // Keep a valid selected project: sync from the route, or default to the first
  // discovered project when nothing valid is selected yet.
  useEffect(() => {
    if (route.kind === "project" && route.slug !== selectedSlug) {
      setSelectedSlug(route.slug);
      return;
    }
    if (projects.length === 0) return;
    const valid = selectedSlug && projects.some((p) => p.slug === selectedSlug);
    if (!valid) setSelectedSlug(projects[0]!.slug);
  }, [route, projects, selectedSlug]);

  useEffect(() => {
    if (!selectedSlug) return;
    try {
      localStorage.setItem(PROJECT_KEY, selectedSlug);
    } catch {
      /* localStorage unavailable */
    }
  }, [selectedSlug]);

  function toggleGroup(groupId: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* localStorage unavailable — keep in-memory only */
      }
      return next;
    });
  }

  const selectedProject =
    projects.find((p) => p.slug === selectedSlug) ?? null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex h-[72px] items-center border-b border-ink-700 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <LogoMark />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-semibold tracking-tight text-fog-50">
              Control Panel
            </div>
            <div className="text-2xs uppercase tracking-widest text-fog-500">
              Claude Code
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group, groupIndex) => {
          const isCollapsed = collapsed[group.id] ?? false;
          return (
            <div key={group.id} className={cn(groupIndex > 0 && "mt-4")}>
              <GroupHeader
                label={group.label}
                collapsed={isCollapsed}
                onToggle={() => toggleGroup(group.id)}
              />
              {!isCollapsed ? (
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NavButton
                        item={item}
                        isActive={
                          route.kind === "global" && route.surface === item.id
                        }
                        count={counts[item.id]}
                        onSelect={(id) =>
                          onNavigate({ kind: "global", surface: id })
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        {/* Project workspace */}
        <div className="mt-4">
          <GroupHeader
            label="Project"
            collapsed={collapsed.project ?? false}
            onToggle={() => toggleGroup("project")}
          />
          {!(collapsed.project ?? false) ? (
            <div className="space-y-1">
              {projects.length === 0 ? (
                <p className="px-2.5 py-1.5 text-2xs text-fog-500">
                  No projects found.
                </p>
              ) : (
                <>
                  <select
                    aria-label="Select project"
                    value={selectedSlug ?? ""}
                    onChange={(e) => {
                      const slug = e.target.value;
                      setSelectedSlug(slug);
                      onNavigate({ kind: "project", slug, surface: "overview" });
                    }}
                    className="w-full rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-sm text-fog-100 outline-none transition-colors hover:border-ink-600 focus:border-ink-600"
                  >
                    {projects.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  {selectedSlug ? (
                    <ul className="space-y-0.5">
                      {PROJECT_SURFACES.map((item) => {
                        const hasContent =
                          item.id !== "overview" &&
                          (selectedProject?.configKinds.includes(
                            item.id,
                          ) ??
                            false);
                        return (
                          <li key={item.id}>
                            <ProjectNavButton
                              label={item.label}
                              icon={item.icon}
                              hasContent={hasContent}
                              isActive={
                                route.kind === "project" &&
                                route.slug === selectedSlug &&
                                route.surface === item.id
                              }
                              onSelect={() =>
                                onNavigate({
                                  kind: "project",
                                  slug: selectedSlug,
                                  surface: item.id,
                                })
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="border-t border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2 text-2xs text-fog-500">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ok" />
          <span className="font-mono">{window.location.host}</span>
        </div>
      </div>
    </aside>
  );
}

interface GroupHeaderProps {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}

function GroupHeader({ label, collapsed, onToggle }: GroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="group flex w-full items-center gap-1.5 rounded px-2.5 pb-1.5 pt-1 text-2xs font-medium uppercase tracking-widest text-fog-500 transition-colors hover:text-fog-300"
    >
      <ChevronIcon
        className={cn(
          "shrink-0 transition-transform",
          collapsed ? "rotate-0" : "rotate-90",
        )}
      />
      <span>{label}</span>
    </button>
  );
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  /** Count badge; undefined => no badge (e.g. still loading). */
  count: number | undefined;
  onSelect: (id: SurfaceId) => void;
}

function NavButton({ item, isActive, count, onSelect }: NavButtonProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
        isActive
          ? "bg-ink-750 text-fog-50"
          : "text-fog-300 hover:bg-ink-800 hover:text-fog-100",
      )}
    >
      <span className={cn("shrink-0", isActive ? "text-fog-100" : "text-fog-400")}>
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
        <span className="block truncate text-2xs text-fog-500">{item.hint}</span>
      </span>
      {count !== undefined ? (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-2xs",
            isActive
              ? "bg-ink-600 text-fog-100"
              : "bg-ink-800 text-fog-400 group-hover:bg-ink-700",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

interface ProjectNavButtonProps {
  label: string;
  icon: NavItem["icon"];
  isActive: boolean;
  /** Show a small dot when this surface has existing content. */
  hasContent: boolean;
  onSelect: () => void;
}

function ProjectNavButton({
  label,
  icon: Icon,
  isActive,
  hasContent,
  onSelect,
}: ProjectNavButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors",
        isActive
          ? "bg-ink-750 text-fog-50"
          : "text-fog-300 hover:bg-ink-800 hover:text-fog-100",
      )}
    >
      <span className={cn("shrink-0", isActive ? "text-fog-100" : "text-fog-400")}>
        <Icon />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {hasContent ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-fog-400"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
