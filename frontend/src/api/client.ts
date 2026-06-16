/**
 * Typed fetch wrapper over the Bun backend. One function per endpoint, each
 * returning the contract type from @shared/contracts. Throws on non-2xx with
 * the backend's { error } message.
 */
import type {
  InstructionsResponse,
  MemoryResponse,
  McpResponse,
  SkillsResponse,
  CommandsResponse,
  SettingsResponse,
  ContextMapResponse,
  FileWriteRequest,
  FileWriteResponse,
  SkillActionRequest,
  McpToggleRequest,
  GraphResponse,
  AgentsResponse,
  AgentWriteRequest,
  FsCreateRequest,
  FsRenameRequest,
  FsDeleteRequest,
  OkResponse,
  McpAddRequest,
  McpRemoveRequest,
  BackupsResponse,
  BackupRestoreRequest,
  GbrainStatus,
  GbrainSearchResponse,
  GbrainRecentResponse,
  GbrainHooksConfig,
  ProjectsResponse,
  ProjectDetail,
  ProjectFileCreateRequest,
  CodeTrustResponse,
  CodeTrustAction,
  CodeTrustActionResponse,
} from "@shared/contracts";
import { invalidate, write } from "@/lib/queryCache";

// Empty base => same-origin in production; the Vite dev proxy forwards /api.
const BASE = "";

/**
 * After a mutation resolves, drop the cached values for any read whose data the
 * change could affect, so the next visit (or a mounted view) refetches. Owning
 * resources whose view writes the fresh result through are intentionally NOT
 * busted here (e.g. MCP add/remove returns the fresh list) to avoid a needless
 * refetch of an expensive query.
 */
function bust<T>(p: Promise<T>, keys: () => (() => Promise<unknown>)[]): Promise<T> {
  return p.then((r) => {
    invalidate(...keys());
    return r;
  });
}

class ApiRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers:
        init?.body != null ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Network error";
    throw new ApiRequestError(`Cannot reach the backend: ${message}`, 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body: unknown = await res.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new ApiRequestError(message, res.status);
  }

  return (await res.json()) as T;
}

export const api = {
  getInstructions: (): Promise<InstructionsResponse> =>
    request<InstructionsResponse>("/api/instructions"),

  getMemory: (): Promise<MemoryResponse> =>
    request<MemoryResponse>("/api/memory"),

  getMcp: (): Promise<McpResponse> => request<McpResponse>("/api/mcp"),

  getSkills: (): Promise<SkillsResponse> =>
    request<SkillsResponse>("/api/skills"),

  getCommands: (): Promise<CommandsResponse> =>
    request<CommandsResponse>("/api/commands"),

  getSettings: (): Promise<SettingsResponse> =>
    request<SettingsResponse>("/api/settings"),

  getContextMap: (): Promise<ContextMapResponse> =>
    request<ContextMapResponse>("/api/context-map"),

  writeFile: (req: FileWriteRequest): Promise<FileWriteResponse> =>
    bust(
      request<FileWriteResponse>("/api/file", {
        method: "PUT",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  // Skills view writes the fresh list through (setData), so getSkills isn't
  // busted here; only the derived graph + backups are.
  skillAction: (req: SkillActionRequest): Promise<SkillsResponse> =>
    bust(
      request<SkillsResponse>("/api/skills/action", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  mcpToggle: (req: McpToggleRequest): Promise<McpResponse> =>
    bust(
      request<McpResponse>("/api/mcp/toggle", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  /* ---- v2: knowledge graph ---- */

  getGraph: (): Promise<GraphResponse> => request<GraphResponse>("/api/graph"),

  /* ---- v2: agents ---- */

  getAgents: (): Promise<AgentsResponse> =>
    request<AgentsResponse>("/api/agents"),

  // AgentsView writes the fresh list through; only derived reads are busted.
  writeAgent: (req: AgentWriteRequest): Promise<AgentsResponse> =>
    bust(
      request<AgentsResponse>("/api/agents", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  /* ---- v2: filesystem CRUD (return OkResponse, so bust the owning lists) ---- */

  fsCreate: (req: FsCreateRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/fs/create", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => fsAffected,
    ),

  fsRename: (req: FsRenameRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/fs/rename", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => fsAffected,
    ),

  fsDelete: (req: FsDeleteRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/fs/delete", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => fsAffected,
    ),

  /* ---- v2: MCP add/remove (view writes fresh list through) ---- */

  mcpAdd: (req: McpAddRequest): Promise<McpResponse> =>
    bust(
      request<McpResponse>("/api/mcp/add", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  mcpRemove: (req: McpRemoveRequest): Promise<McpResponse> =>
    bust(
      request<McpResponse>("/api/mcp/remove", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getGraph, api.getBackups],
    ),

  /* ---- v2: backups ---- */

  getBackups: (): Promise<BackupsResponse> =>
    request<BackupsResponse>("/api/backups"),

  restoreBackup: (req: BackupRestoreRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/backups/restore", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [
        api.getInstructions,
        api.getMemory,
        api.getCommands,
        api.getSettings,
        api.getAgents,
        api.getGraph,
        api.getBackups,
      ],
    ),

  /* ---- v2: gbrain ---- */

  gbrainStatus: (): Promise<GbrainStatus> =>
    request<GbrainStatus>("/api/gbrain/status"),

  gbrainSearch: (q: string): Promise<GbrainSearchResponse> =>
    request<GbrainSearchResponse>(
      `/api/gbrain/search?q=${encodeURIComponent(q)}`,
    ),

  gbrainRecent: (): Promise<GbrainRecentResponse> =>
    request<GbrainRecentResponse>("/api/gbrain/recent"),

  gbrainSync: (): Promise<OkResponse> =>
    bust(request<OkResponse>("/api/gbrain/sync", { method: "POST" }), () => [
      api.gbrainStatus,
      api.gbrainRecent,
    ]),

  /* ---- Project workspace ---- */

  getProjects: (): Promise<ProjectsResponse> =>
    request<ProjectsResponse>("/api/projects"),

  getProjectDetail: (slug: string): Promise<ProjectDetail> =>
    request<ProjectDetail>(
      `/api/projects/detail?slug=${encodeURIComponent(slug)}`,
    ),

  projectFileCreate: (req: ProjectFileCreateRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/projects/file/create", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getProjects, api.getBackups],
    ),

  projectFileRename: (req: FsRenameRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/projects/file/rename", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getProjects, api.getBackups],
    ),

  projectFileDelete: (req: FsDeleteRequest): Promise<OkResponse> =>
    bust(
      request<OkResponse>("/api/projects/file/delete", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getProjects, api.getBackups],
    ),

  getGbrainHooks: (): Promise<GbrainHooksConfig> =>
    request<GbrainHooksConfig>("/api/gbrain/hooks"),

  setGbrainHooks: (req: GbrainHooksConfig): Promise<GbrainHooksConfig> =>
    request<GbrainHooksConfig>("/api/gbrain/hooks", {
      method: "PUT",
      body: JSON.stringify(req),
    }),

  /* ---- Code Trust ---- */

  getCodeTrust: (): Promise<CodeTrustResponse> =>
    request<CodeTrustResponse>("/api/code-trust"),

  codeTrustAction: (req: CodeTrustAction): Promise<CodeTrustActionResponse> =>
    request<CodeTrustActionResponse>("/api/code-trust/action", {
      method: "POST",
      body: JSON.stringify(req),
    }).then((r) => {
      write(api.getCodeTrust, r.data);
      return r;
    }),
};

// Reads a filesystem CRUD op can affect: the owning lists (which return only
// OkResponse, so the view can't write them through) plus derived graph/backups.
const fsAffected: (() => Promise<unknown>)[] = [
  api.getInstructions,
  api.getMemory,
  api.getCommands,
  api.getAgents,
  api.getGraph,
  api.getBackups,
];

export { ApiRequestError };
