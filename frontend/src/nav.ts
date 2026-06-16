import type { ComponentType, SVGProps } from "react";
import type { ProjectSurfaceId } from "@shared/contracts";
import {
  InstructionsIcon,
  MemoryIcon,
  McpIcon,
  SkillsIcon,
  CommandsIcon,
  SettingsIcon,
  ContextMapIcon,
  AgentsIcon,
  BackupsIcon,
  GbrainIcon,
  OverviewIcon,
  RulesIcon,
  CodeTrustIcon,
} from "@/components/icons";

export type SurfaceId =
  | "instructions"
  | "memory"
  | "mcp"
  | "skills"
  | "commands"
  | "agents"
  | "settings"
  | "context-map"
  | "backups"
  | "gbrain"
  | "code-trust";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  id: SurfaceId;
  label: string;
  hint: string;
  icon: IconType;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Global surfaces clustered by purpose:
 * - Context      — what Claude reads / remembers
 * - Capabilities — what Claude can do
 * - System       — configuration & utilities
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "context",
    label: "Context",
    items: [
      {
        id: "instructions",
        label: "Instructions",
        hint: "CLAUDE.md & rules",
        icon: InstructionsIcon,
      },
      {
        id: "memory",
        label: "Memory",
        hint: "Persistent notes",
        icon: MemoryIcon,
      },
      { id: "gbrain", label: "GBrain", hint: "Session memory", icon: GbrainIcon },
    ],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    items: [
      { id: "mcp", label: "MCP Servers", hint: "Tool connectors", icon: McpIcon },
      {
        id: "skills",
        label: "Skills",
        hint: "Active & archived",
        icon: SkillsIcon,
      },
      {
        id: "commands",
        label: "Commands",
        hint: "Slash commands",
        icon: CommandsIcon,
      },
      { id: "agents", label: "Agents", hint: "Subagent specs", icon: AgentsIcon },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        id: "settings",
        label: "Settings",
        hint: "settings.json",
        icon: SettingsIcon,
      },
      {
        id: "context-map",
        label: "Context Map",
        hint: "Knowledge graph",
        icon: ContextMapIcon,
      },
      {
        id: "backups",
        label: "Backups",
        hint: "Restore points",
        icon: BackupsIcon,
      },
      {
        id: "code-trust",
        label: "Code Trust",
        hint: "AI-code fixes",
        icon: CodeTrustIcon,
      },
    ],
  },
];

/** Flattened list of every global surface, in sidebar order. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/* ---- Project workspace ---- */

/** A surface within the project workspace (plus the synthetic "overview"). */
export type ProjectRouteSurface = "overview" | ProjectSurfaceId;

export interface ProjectNavItem {
  id: ProjectRouteSurface;
  label: string;
  icon: IconType;
}

/**
 * The active location in the app: either a global surface or a project surface.
 * Project routes carry the selected project's slug.
 */
export type Route =
  | { kind: "global"; surface: SurfaceId }
  | { kind: "project"; slug: string; surface: ProjectRouteSurface };

/** Project surfaces in sidebar order. Overview first, then config surfaces. */
export const PROJECT_SURFACES: ProjectNavItem[] = [
  { id: "overview", label: "Overview", icon: OverviewIcon },
  { id: "instructions", label: "Instructions", icon: InstructionsIcon },
  { id: "memory", label: "Memory", icon: MemoryIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "commands", label: "Commands", icon: CommandsIcon },
  { id: "agents", label: "Agents", icon: AgentsIcon },
  { id: "rules", label: "Rules", icon: RulesIcon },
  { id: "mcp", label: "MCP", icon: McpIcon },
];
