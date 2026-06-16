/**
 * Bun HTTP server: REST API over ~/.claude + static frontend serving.
 * Binds 127.0.0.1 only. Routing + static serving only — logic lives in api/.
 */
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { FRONTEND_DIST, PORT } from "./config.ts";
import { instructions } from "./api/instructions.ts";
import { memory } from "./api/memory.ts";
import { mcp } from "./api/mcp.ts";
import { skills } from "./api/skills.ts";
import { commands } from "./api/commands.ts";
import { settings } from "./api/settings.ts";
import { contextMap } from "./api/contextMap.ts";
import { mcpToggle, skillAction, writeFile } from "./api/file.ts";
import { graph } from "./api/graph.ts";
import { agents, writeAgent } from "./api/agents.ts";
import * as fsApi from "./api/fs.ts";
import { mcpAdd, mcpRemove } from "./api/mcp.ts";
import * as backupsApi from "./api/backups.ts";
import * as gbrainApi from "./api/gbrain.ts";
import * as projectsApi from "./api/projects.ts";
import { getCodeTrust, codeTrustAction } from "./api/clean-trust.ts";
import { ApiHttpError } from "./api/errors.ts";
import { ZodError } from "zod";
import {
  AgentWriteRequest,
  BackupRestoreRequest,
  FileWriteRequest,
  FsCreateRequest,
  FsDeleteRequest,
  FsRenameRequest,
  GbrainHooksConfig,
  McpAddRequest,
  McpRemoveRequest,
  McpToggleRequest,
  ProjectFileCreateRequest,
  SkillActionRequest,
} from "../../shared/contracts.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof ApiHttpError) return json({ error: err.message }, err.status);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first ? first.path.join(".") || "body" : "body";
    const why = first ? first.message : "validation failed";
    return json({ error: `Invalid request (${where}): ${why}` }, 400);
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return json({ error: message }, 500);
}

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiHttpError(400, "Invalid JSON request body");
  }
}

const MISSING_DIST_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Claude Code Control Panel</title>
<style>body{font:16px/1.5 system-ui;margin:4rem auto;max-width:36rem;color:#222}
code{background:#f0f0f0;padding:.1em .35em;border-radius:4px}</style></head>
<body><h1>Frontend not built yet</h1>
<p>The API is running, but the UI bundle is missing.</p>
<p>Run <code>scripts/launch.sh</code> to build the frontend, then reload.</p>
</body></html>`;

/** Serve a static asset from the built frontend, with SPA fallback. */
async function serveStatic(pathname: string): Promise<Response> {
  if (!existsSync(FRONTEND_DIST)) {
    return new Response(MISSING_DIST_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(FRONTEND_DIST, rel === "/" ? "index.html" : rel);

  // Guard against path traversal out of the dist root.
  if (candidate.startsWith(FRONTEND_DIST)) {
    const file = Bun.file(candidate);
    if (await file.exists()) return new Response(file);
  }

  // SPA fallback to index.html for client-side routes.
  const index = Bun.file(join(FRONTEND_DIST, "index.html"));
  if (await index.exists()) return new Response(index);

  return new Response("Not found", { status: 404 });
}

type Handler = () => Promise<unknown>;

const GET_ROUTES: Record<string, Handler> = {
  "/api/health": async () => ({ ok: true }),
  "/api/instructions": instructions,
  "/api/memory": memory,
  "/api/mcp": mcp,
  "/api/skills": skills,
  "/api/commands": commands,
  "/api/settings": settings,
  "/api/context-map": contextMap,
  "/api/graph": graph,
  "/api/agents": agents,
  "/api/projects": projectsApi.listProjects,
  "/api/backups": backupsApi.list,
  "/api/gbrain/status": gbrainApi.status,
  "/api/gbrain/recent": gbrainApi.recent,
  "/api/gbrain/hooks": async () => gbrainApi.getHooksConfig(),
  "/api/code-trust": async () => getCodeTrust(),
};

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === "GET") {
      if (pathname === "/api/gbrain/search") {
        const q = url.searchParams.get("q") ?? "";
        return json(await gbrainApi.search(q));
      }
      if (pathname === "/api/projects/detail") {
        const slug = url.searchParams.get("slug") ?? "";
        return json(await projectsApi.projectDetail(slug));
      }
      const route = GET_ROUTES[pathname];
      if (route) return json(await route());
      if (pathname.startsWith("/api/")) {
        return json({ error: `Unknown endpoint: ${pathname}` }, 404);
      }
      return await serveStatic(pathname);
    }

    if (req.method === "PUT" && pathname === "/api/file") {
      const body = FileWriteRequest.parse(await parseBody(req));
      return json(await writeFile(body));
    }

    if (req.method === "POST" && pathname === "/api/skills/action") {
      const body = SkillActionRequest.parse(await parseBody(req));
      return json(await skillAction(body));
    }

    if (req.method === "POST" && pathname === "/api/mcp/toggle") {
      const body = McpToggleRequest.parse(await parseBody(req));
      return json(await mcpToggle(body));
    }

    if (req.method === "POST" && pathname === "/api/agents") {
      const body = AgentWriteRequest.parse(await parseBody(req));
      return json(await writeAgent(body));
    }

    if (req.method === "POST" && pathname === "/api/fs/create") {
      const body = FsCreateRequest.parse(await parseBody(req));
      return json(await fsApi.create(body));
    }

    if (req.method === "POST" && pathname === "/api/fs/rename") {
      const body = FsRenameRequest.parse(await parseBody(req));
      return json(await fsApi.rename(body));
    }

    if (req.method === "POST" && pathname === "/api/fs/delete") {
      const body = FsDeleteRequest.parse(await parseBody(req));
      return json(await fsApi.del(body));
    }

    if (req.method === "POST" && pathname === "/api/mcp/add") {
      const body = McpAddRequest.parse(await parseBody(req));
      return json(await mcpAdd(body));
    }

    if (req.method === "POST" && pathname === "/api/mcp/remove") {
      const body = McpRemoveRequest.parse(await parseBody(req));
      return json(await mcpRemove(body));
    }

    if (req.method === "POST" && pathname === "/api/projects/file/create") {
      const body = ProjectFileCreateRequest.parse(await parseBody(req));
      return json(await projectsApi.projectFileCreate(body));
    }

    if (req.method === "POST" && pathname === "/api/projects/file/rename") {
      const body = FsRenameRequest.parse(await parseBody(req));
      return json(await projectsApi.projectFileRename(body));
    }

    if (req.method === "POST" && pathname === "/api/projects/file/delete") {
      const body = FsDeleteRequest.parse(await parseBody(req));
      return json(await projectsApi.projectFileDelete(body));
    }

    if (req.method === "POST" && pathname === "/api/backups/restore") {
      const body = BackupRestoreRequest.parse(await parseBody(req));
      return json(await backupsApi.restore(body));
    }

    if (req.method === "POST" && pathname === "/api/code-trust/action") {
      const body = await parseBody(req);
      return json(await codeTrustAction(body));
    }

    if (req.method === "POST" && pathname === "/api/gbrain/sync") {
      return json(await gbrainApi.sync());
    }

    if (req.method === "PUT" && pathname === "/api/gbrain/hooks") {
      const body = GbrainHooksConfig.parse(await parseBody(req));
      return json(gbrainApi.setHooksConfig(body));
    }

    return json({ error: `Method/route not supported: ${req.method} ${pathname}` }, 404);
  } catch (err) {
    return errorResponse(err);
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  // `claude mcp list` runs ~10-15s health checks; `gbrain query`/`gbrain doctor`
  // can take 60-90s. Keep the connection open long enough for the slowest
  // CLI-backed routes (/api/mcp, /api/gbrain/*) to complete. Bun caps this at 255.
  idleTimeout: 120,
  fetch: handle,
});

console.log(
  `Claude Code Control Panel API on http://${server.hostname}:${server.port}`,
);
