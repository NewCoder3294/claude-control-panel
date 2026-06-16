/**
 * Mutations: file writes (with backup + path guard), skill archive/restore,
 * and MCP enable/disable. All writes are reversible and validated.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  ARCHIVE_DIR,
  CLAUDE_DIR,
  CLAUDE_JSON,
  SKILLS_DIR,
} from "../config.ts";
import { backupFile } from "../lib/backup.ts";
import { readText, toConfigFile } from "../lib/fsutil.ts";
import { isProjectScopedPath } from "../lib/projects.ts";
import { instructions, projectInstructionFiles } from "./instructions.ts";
import { skills } from "./skills.ts";
import { mcp } from "./mcp.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import {
  FileWriteResponse,
  McpResponse,
  SkillsResponse,
  type FileWriteRequest,
  type McpToggleRequest,
  type SkillActionRequest,
} from "../../../shared/contracts.ts";

const SKILL_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function isInside(dir: string, target: string): boolean {
  const d = resolve(dir);
  return target === d || target.startsWith(d + "/");
}

/**
 * A write is permitted if the resolved path is inside CLAUDE_DIR, lies within a
 * discovered project's writable scope (repo .claude/, CLAUDE.md, .mcp.json, or
 * project memory), or exactly matches an editable project CLAUDE.md path.
 */
function assertWritable(resolvedPath: string): void {
  if (isInside(CLAUDE_DIR, resolvedPath)) return;
  if (isProjectScopedPath(resolvedPath)) return;
  const allowed = new Set(projectInstructionFiles().map((f) => f.path));
  if (allowed.has(resolvedPath)) return;
  throw forbidden(`Write outside permitted scope: ${resolvedPath}`);
}

/** Move a directory; fall back to copy+remove across devices. */
function moveDir(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch {
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

export async function writeFile(
  req: FileWriteRequest,
): Promise<FileWriteResponse> {
  const { path, content } = req;
  if (path.includes("\0")) throw badRequest("Path contains a null byte");

  const resolved = resolve(path);
  assertWritable(resolved);

  // Any permitted .json write (global or project-scoped, e.g. a project's
  // settings.json / .mcp.json) must parse before we overwrite it.
  if (resolved.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw badRequest(`Invalid JSON: ${reason}`);
    }
  }

  const backup = backupFile(resolved);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, "utf8");

  const file = toConfigFile({
    path: resolved,
    label: basename(resolved),
    editable: true,
  });

  return FileWriteResponse.parse({ ok: true, file, backup });
}

export async function skillAction(
  req: SkillActionRequest,
): Promise<SkillsResponse> {
  const { name, action } = req;
  if (!SKILL_NAME_RE.test(name)) {
    throw badRequest(`Invalid skill name: ${name}`);
  }

  const activePath = resolve(SKILLS_DIR, name);
  const archivedPath = resolve(ARCHIVE_DIR, name);
  // Defense in depth: keep resolved targets inside their respective roots.
  if (!isInside(SKILLS_DIR, activePath) || !isInside(ARCHIVE_DIR, archivedPath)) {
    throw badRequest(`Invalid skill name: ${name}`);
  }

  if (action === "archive") {
    if (!existsSync(activePath)) throw notFound(`Active skill not found: ${name}`);
    moveDir(activePath, archivedPath);
  } else {
    if (!existsSync(archivedPath)) {
      throw notFound(`Archived skill not found: ${name}`);
    }
    moveDir(archivedPath, activePath);
  }

  return skills();
}

interface ClaudeJsonMutable {
  mcpServers?: Record<string, unknown>;
  disabledMcpServers?: string[];
  disabledMcpServersConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function mcpToggle(req: McpToggleRequest): Promise<McpResponse> {
  const { name, action } = req;
  if (!SKILL_NAME_RE.test(name)) {
    throw badRequest(`Invalid server name: ${name}`);
  }

  const raw = readText(CLAUDE_JSON);
  if (raw === null) throw notFound("~/.claude.json not found");

  let parsed: ClaudeJsonMutable;
  try {
    const j: unknown = JSON.parse(raw);
    if (typeof j !== "object" || j === null) {
      throw new Error("not an object");
    }
    parsed = j as ClaudeJsonMutable;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw badRequest(`Invalid ~/.claude.json: ${reason}`);
  }

  const servers = parsed.mcpServers ?? {};
  const disabledNames = Array.isArray(parsed.disabledMcpServers)
    ? parsed.disabledMcpServers.filter((x): x is string => typeof x === "string")
    : [];
  const disabledConfig = parsed.disabledMcpServersConfig ?? {};

  const isManaged =
    Object.prototype.hasOwnProperty.call(servers, name) ||
    Object.prototype.hasOwnProperty.call(disabledConfig, name) ||
    disabledNames.includes(name);
  if (!isManaged) {
    throw forbidden(
      `Server "${name}" is not managed locally (manage it in the claude.ai app).`,
    );
  }

  if (action === "disable") {
    if (Object.prototype.hasOwnProperty.call(servers, name)) {
      disabledConfig[name] = servers[name];
      delete servers[name];
    }
    if (!disabledNames.includes(name)) disabledNames.push(name);
  } else {
    if (Object.prototype.hasOwnProperty.call(disabledConfig, name)) {
      servers[name] = disabledConfig[name];
      delete disabledConfig[name];
    }
    const idx = disabledNames.indexOf(name);
    if (idx !== -1) disabledNames.splice(idx, 1);
  }

  parsed.mcpServers = servers;
  parsed.disabledMcpServers = disabledNames;
  parsed.disabledMcpServersConfig = disabledConfig;

  backupFile(CLAUDE_JSON);
  writeFileSync(CLAUDE_JSON, JSON.stringify(parsed, null, 2), "utf8");

  return mcp();
}

// Re-export for callers that want to validate write scope (e.g. server tests).
export { instructions };
