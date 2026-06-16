/**
 * Single source of truth for every API payload shape.
 * Shared by the Bun backend and the React frontend.
 */
import { z } from "zod";

/** A config file Claude Code reads (or could read). */
export const ConfigFile = z.object({
  /** Absolute path on disk. */
  path: z.string(),
  /** Human label (e.g. "Global CLAUDE.md", "myproject · CLAUDE.md"). */
  label: z.string(),
  /** Path shown to the user, with $HOME collapsed to ~. */
  displayPath: z.string(),
  exists: z.boolean(),
  content: z.string(),
  bytes: z.number(),
  /** ISO mtime, or null if missing. */
  mtime: z.string().nullable(),
  /** Whether the panel allows editing this file. */
  editable: z.boolean(),
});
export type ConfigFile = z.infer<typeof ConfigFile>;

export const InstructionsResponse = z.object({
  global: ConfigFile,
  projects: z.array(ConfigFile),
  rules: z.array(ConfigFile),
});
export type InstructionsResponse = z.infer<typeof InstructionsResponse>;

export const MemoryResponse = z.object({
  dir: z.string(),
  displayDir: z.string(),
  index: ConfigFile.nullable(),
  files: z.array(ConfigFile),
});
export type MemoryResponse = z.infer<typeof MemoryResponse>;

export const McpServer = z.object({
  name: z.string(),
  scope: z.string(),
  status: z.enum(["connected", "needs-auth", "failed", "disabled", "unknown"]),
  transport: z.string(),
  detail: z.string(),
  /** False for claude.ai-scoped connectors (cannot manage locally). */
  managedLocally: z.boolean(),
});
export type McpServer = z.infer<typeof McpServer>;

export const McpResponse = z.object({
  servers: z.array(McpServer),
  disabled: z.array(z.string()),
});
export type McpResponse = z.infer<typeof McpResponse>;

export const Skill = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  archived: z.boolean(),
});
export type Skill = z.infer<typeof Skill>;

export const SkillsResponse = z.object({
  active: z.array(Skill),
  archived: z.array(Skill),
  archiveDir: z.string(),
});
export type SkillsResponse = z.infer<typeof SkillsResponse>;

export const CommandsResponse = z.object({
  commands: z.array(ConfigFile),
});
export type CommandsResponse = z.infer<typeof CommandsResponse>;

export const SettingsResponse = z.object({
  settings: ConfigFile,
  local: ConfigFile.nullable(),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

export const ContextMapEntry = z.object({
  surface: z.string(),
  summary: z.string(),
  count: z.number(),
  loadedAtStartup: z.boolean(),
});
export type ContextMapEntry = z.infer<typeof ContextMapEntry>;

export const ContextMapResponse = z.object({
  entries: z.array(ContextMapEntry),
});
export type ContextMapResponse = z.infer<typeof ContextMapResponse>;

/* ---- Mutations ---- */

export const FileWriteRequest = z.object({
  path: z.string(),
  content: z.string(),
});
export type FileWriteRequest = z.infer<typeof FileWriteRequest>;

export const FileWriteResponse = z.object({
  ok: z.boolean(),
  file: ConfigFile,
  backup: z.string(),
});
export type FileWriteResponse = z.infer<typeof FileWriteResponse>;

export const SkillActionRequest = z.object({
  name: z.string(),
  action: z.enum(["archive", "restore"]),
});
export type SkillActionRequest = z.infer<typeof SkillActionRequest>;

export const McpToggleRequest = z.object({
  name: z.string(),
  action: z.enum(["disable", "enable"]),
});
export type McpToggleRequest = z.infer<typeof McpToggleRequest>;

export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/* ============================================================
 * v2 — knowledge graph (in-process) + full management
 * ============================================================ */

/** Node types in the config knowledge graph. */
export const GraphNodeType = z.enum([
  "claude-md",
  "rule",
  "memory",
  "skill",
  "mcp",
  "command",
  "agent",
  "project",
  "settings",
  "plugin",
]);
export type GraphNodeType = z.infer<typeof GraphNodeType>;

export const GraphNode = z.object({
  id: z.string(),
  label: z.string(),
  type: GraphNodeType,
  /** "startup" = injected at session start; "on-demand" = loaded when invoked. */
  group: z.enum(["startup", "on-demand"]),
  /** Absolute path of the backing file, if any (lets the UI deep-link to it). */
  path: z.string().nullable(),
  /** Which panel surface this node maps to, for click-through navigation. */
  surface: z.string().nullable(),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const GraphResponse = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type GraphResponse = z.infer<typeof GraphResponse>;

/* ---- Agents ---- */

export const AgentSpec = z.object({
  name: z.string(),
  path: z.string(),
  displayPath: z.string(),
  description: z.string(),
  /** Tool allowlist as written in frontmatter ("*" or comma list); "" if unset. */
  tools: z.string(),
  /** Model override (e.g. "sonnet", "opus", "haiku", "inherit"); "" if unset. */
  model: z.string(),
  /** System-prompt body (markdown after frontmatter). */
  prompt: z.string(),
  mtime: z.string().nullable(),
});
export type AgentSpec = z.infer<typeof AgentSpec>;

export const AgentsResponse = z.object({
  agents: z.array(AgentSpec),
  dir: z.string(),
  displayDir: z.string(),
});
export type AgentsResponse = z.infer<typeof AgentsResponse>;

export const AgentWriteRequest = z.object({
  /** Original name when renaming/updating; omit/empty for create. */
  originalName: z.string().optional(),
  name: z.string(),
  description: z.string(),
  tools: z.string(),
  model: z.string(),
  prompt: z.string(),
});
export type AgentWriteRequest = z.infer<typeof AgentWriteRequest>;

/* ---- Generic filesystem CRUD (commands / memory / rules) ---- */

export const FsKind = z.enum(["command", "memory", "rule"]);
export type FsKind = z.infer<typeof FsKind>;

export const FsCreateRequest = z.object({
  kind: FsKind,
  /** Base name without extension (extension added per kind). */
  name: z.string(),
  content: z.string().default(""),
});
export type FsCreateRequest = z.infer<typeof FsCreateRequest>;

export const FsRenameRequest = z.object({
  path: z.string(),
  /** New base name without extension. */
  newName: z.string(),
});
export type FsRenameRequest = z.infer<typeof FsRenameRequest>;

export const FsDeleteRequest = z.object({ path: z.string() });
export type FsDeleteRequest = z.infer<typeof FsDeleteRequest>;

export const OkResponse = z.object({
  ok: z.boolean(),
  /** Trash path when a delete was performed (reversible). */
  trash: z.string().optional(),
});
export type OkResponse = z.infer<typeof OkResponse>;

/* ---- MCP add/remove (local scope only) ---- */

export const McpAddRequest = z.object({
  name: z.string(),
  transport: z.enum(["stdio", "http"]),
  /** stdio: the command + args (space-joined ok); http: leave empty. */
  command: z.string().default(""),
  /** http: the server URL; stdio: leave empty. */
  url: z.string().default(""),
});
export type McpAddRequest = z.infer<typeof McpAddRequest>;

export const McpRemoveRequest = z.object({ name: z.string() });
export type McpRemoveRequest = z.infer<typeof McpRemoveRequest>;

/* ---- Backups browser + restore ---- */

export const BackupEntry = z.object({
  /** ISO-ish timestamp of the backup. */
  timestamp: z.string(),
  originalPath: z.string(),
  displayOriginalPath: z.string(),
  backupPath: z.string(),
  bytes: z.number(),
});
export type BackupEntry = z.infer<typeof BackupEntry>;

export const BackupsResponse = z.object({
  backups: z.array(BackupEntry),
});
export type BackupsResponse = z.infer<typeof BackupsResponse>;

export const BackupRestoreRequest = z.object({
  backupPath: z.string(),
  originalPath: z.string(),
});
export type BackupRestoreRequest = z.infer<typeof BackupRestoreRequest>;

/* ============================================================
 * v2 — GBrain (the brain for Claude Code sessions)
 * ============================================================ */

export const GbrainStatus = z.object({
  /** gbrain CLI reachable + brain healthy. */
  ok: z.boolean(),
  version: z.string(),
  engine: z.string(),
  embedder: z.string(),
  pages: z.number(),
  chunks: z.number(),
  /** Actionable note when not ok. */
  hint: z.string(),
});
export type GbrainStatus = z.infer<typeof GbrainStatus>;

export const GbrainSearchResult = z.object({
  slug: z.string(),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
  type: z.string(),
});
export type GbrainSearchResult = z.infer<typeof GbrainSearchResult>;

export const GbrainSearchResponse = z.object({
  query: z.string(),
  results: z.array(GbrainSearchResult),
});
export type GbrainSearchResponse = z.infer<typeof GbrainSearchResponse>;

export const GbrainRecentItem = z.object({
  slug: z.string(),
  title: z.string(),
  when: z.string(),
});
export const GbrainRecentResponse = z.object({
  items: z.array(GbrainRecentItem),
});
export type GbrainRecentResponse = z.infer<typeof GbrainRecentResponse>;

/** Toggle config the hooks read on each run (so the UI can flip them
 * without editing settings.json). Stored at ~/.claude/gbrain-hooks.json. */
export const GbrainHooksConfig = z.object({
  recall: z.boolean(),
  capture: z.boolean(),
  perPromptRecall: z.boolean(),
  topK: z.number(),
  /** Whether the settings.json hook entries are installed at all. */
  installed: z.boolean(),
});
export type GbrainHooksConfig = z.infer<typeof GbrainHooksConfig>;

/* ============================================================
 * Code-Trust (Trust-HUD fix inbox + per-project trust scores)
 * ============================================================ */

export const FixEntry = z.object({
  id: z.string(),
  file: z.string(),
  displayFile: z.string(),
  line: z.number().nullable(),
  badSymbol: z.string(),
  candidates: z.array(z.string()),
  createdAt: z.string(),
});
export type FixEntry = z.infer<typeof FixEntry>;

export const ProjectTrust = z.object({
  projectId: z.string(),
  repo: z.string(),
  branch: z.string().nullable(),
  localPath: z.string().nullable(),
  score: z.number().nullable(),
  label: z.string().nullable(),
  indexFresh: z.boolean(),
  entityCount: z.number().nullable(),
  fixes: z.array(FixEntry),
});
export type ProjectTrust = z.infer<typeof ProjectTrust>;

export const CodeTrustResponse = z.object({
  available: z.boolean(),
  projects: z.array(ProjectTrust),
});
export type CodeTrustResponse = z.infer<typeof CodeTrustResponse>;

export const CodeTrustAction = z.object({
  projectId: z.string(),
  id: z.string().regex(/^[0-9a-f]{1,16}$/, "id must be a short hex token"),
  action: z.enum(["apply", "reject"]),
  pick: z.number().optional(),
});
export type CodeTrustAction = z.infer<typeof CodeTrustAction>;

export const CodeTrustActionResponse = z.object({
  status: z.enum(["applied", "stale", "rejected", "not-found", "error"]),
  message: z.string(),
  data: CodeTrustResponse,
});
export type CodeTrustActionResponse = z.infer<typeof CodeTrustActionResponse>;

/* ============================================================
 * Project Workspace — per-project scoped config management
 * ============================================================ */

/** A file surface that can be managed within a single project. */
export const ProjectSurfaceId = z.enum([
  "instructions",
  "memory",
  "settings",
  "commands",
  "agents",
  "rules",
  "mcp",
]);
export type ProjectSurfaceId = z.infer<typeof ProjectSurfaceId>;

/** Summary card for one discovered project (sidebar switcher + list). */
export const ProjectSummary = z.object({
  /** Registry slug = path with non-alphanumerics -> "-". Stable id. */
  slug: z.string(),
  /** Display name (basename of the project root). */
  name: z.string(),
  /** Absolute project root. */
  path: z.string(),
  /** Root with $HOME collapsed to ~. */
  displayPath: z.string(),
  /** Which surfaces currently have content (for badges / overview). */
  configKinds: z.array(ProjectSurfaceId),
  /** Count of *.jsonl session transcripts in the registry dir. */
  sessionCount: z.number(),
  /** Newest session activity (ISO), or null. */
  lastActive: z.string().nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectsResponse = z.object({
  projects: z.array(ProjectSummary),
});
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;

/**
 * One surface's files within a project.
 * - "named": a directory of user-named .md files (create via name modal).
 * - "fixed": canonical files (created by saving the templated missing file).
 */
export const ProjectFileGroup = z.object({
  surface: ProjectSurfaceId,
  label: z.string(),
  createMode: z.enum(["named", "fixed"]),
  /** Target dir for named-create; "" for fixed-only surfaces. */
  dir: z.string(),
  displayDir: z.string(),
  /** For fixed surfaces, missing files are included (exists:false + template). */
  files: z.array(ConfigFile),
});
export type ProjectFileGroup = z.infer<typeof ProjectFileGroup>;

export const ProjectDetail = z.object({
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  displayPath: z.string(),
  sessionCount: z.number(),
  lastActive: z.string().nullable(),
  groups: z.array(ProjectFileGroup),
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

/** Create a named .md file in a project surface's directory. */
export const ProjectFileCreateRequest = z.object({
  slug: z.string(),
  surface: ProjectSurfaceId,
  /** Base name without extension. */
  name: z.string(),
});
export type ProjectFileCreateRequest = z.infer<typeof ProjectFileCreateRequest>;
