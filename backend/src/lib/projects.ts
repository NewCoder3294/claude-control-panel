/**
 * Project discovery + the project-scoped write boundary.
 *
 * Claude Code records every project it has worked in under the `projects` map of
 * ~/.claude.json (keys are absolute paths). Each project also gets a registry
 * directory ~/.claude/projects/<slug> holding its memory + session transcripts,
 * where <slug> = path with every non-alphanumeric char replaced by "-".
 *
 * This module is the single source of truth for "what projects exist" and "which
 * paths may a project-scoped write touch". No HTTP knowledge.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { HOME, PROJECTS_DIR, CLAUDE_JSON } from "../config.ts";
import { isInside } from "./pathguard.ts";

export interface ProjectInfo {
  /** Absolute project root (the repo dir). */
  path: string;
  /** Display name (basename of the root). */
  name: string;
  /** Registry slug = path with non-alphanumerics -> "-". */
  slug: string;
  /** <root>/.claude */
  claudeDir: string;
  /** ~/.claude/projects/<slug>/memory */
  memoryDir: string;
  /** Newest session/transcript mtime (ISO), or null if none. */
  lastActive: string | null;
  /** Number of *.jsonl session transcripts in the registry dir. */
  sessionCount: number;
}

/** Claude Code's project slug: every non-alphanumeric char becomes "-". */
export function slugForPath(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Read the `projects` map keys from ~/.claude.json (absolute paths). */
function readRegisteredPaths(): string[] {
  try {
    const raw = readFileSync(CLAUDE_JSON, "utf8");
    const j: unknown = JSON.parse(raw);
    if (typeof j !== "object" || j === null) return [];
    const projects = (j as { projects?: unknown }).projects;
    if (typeof projects !== "object" || projects === null) return [];
    return Object.keys(projects as Record<string, unknown>);
  } catch {
    return [];
  }
}

/** Newest mtime + count of *.jsonl transcripts in a registry slug dir. */
function sessionActivity(slugDir: string): {
  lastActive: string | null;
  sessionCount: number;
} {
  let newest = 0;
  let count = 0;
  try {
    for (const name of readdirSync(slugDir)) {
      if (!name.endsWith(".jsonl")) continue;
      count += 1;
      try {
        const ms = statSync(join(slugDir, name)).mtimeMs;
        if (ms > newest) newest = ms;
      } catch {
        // entry vanished — skip
      }
    }
  } catch {
    // no registry dir — fine
  }
  return {
    lastActive: newest > 0 ? new Date(newest).toISOString() : null,
    sessionCount: count,
  };
}

/**
 * Discover real projects: registered in ~/.claude.json, still present on disk,
 * and not $HOME itself (which is the "Global" scope). Sorted by most recent
 * session activity, then name.
 */
export function discoverProjects(): ProjectInfo[] {
  const seen = new Set<string>();
  const out: ProjectInfo[] = [];

  for (const raw of readRegisteredPaths()) {
    const root = resolve(raw);
    if (root === HOME) continue;
    if (seen.has(root)) continue;
    if (!existsSync(root)) continue;
    try {
      if (!statSync(root).isDirectory()) continue;
    } catch {
      continue;
    }
    seen.add(root);

    const slug = slugForPath(root);
    const slugDir = join(PROJECTS_DIR, slug);
    const { lastActive, sessionCount } = sessionActivity(slugDir);

    out.push({
      path: root,
      name: basename(root),
      slug,
      claudeDir: join(root, ".claude"),
      memoryDir: join(slugDir, "memory"),
      lastActive,
      sessionCount,
    });
  }

  out.sort((a, b) => {
    if (a.lastActive && b.lastActive) return a.lastActive < b.lastActive ? 1 : -1;
    if (a.lastActive) return -1;
    if (b.lastActive) return 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Find a discovered project by its slug, or null. */
export function projectBySlug(slug: string): ProjectInfo | null {
  return discoverProjects().find((p) => p.slug === slug) ?? null;
}

/**
 * The writable roots a project-scoped mutation may touch, for one project:
 *  - <root>/.claude/**        (settings, commands, agents, rules, project CLAUDE.md)
 *  - <root>/CLAUDE.md         (top-level instructions)
 *  - <root>/.mcp.json         (project MCP servers)
 *  - <memoryDir>/**           (project memory under ~/.claude/projects/<slug>)
 */
function isInsideProject(info: ProjectInfo, resolved: string): boolean {
  if (isInside(info.claudeDir, resolved)) return true;
  if (isInside(info.memoryDir, resolved)) return true;
  if (resolved === resolve(join(info.path, "CLAUDE.md"))) return true;
  if (resolved === resolve(join(info.path, ".mcp.json"))) return true;
  return false;
}

/**
 * True if `resolved` (already absolute) lies within the writable scope of ANY
 * discovered project. This is the boundary that lets the panel edit repo-dir
 * config outside ~/.claude — arbitrary paths stay rejected.
 */
export function isProjectScopedPath(resolved: string): boolean {
  for (const info of discoverProjects()) {
    if (isInsideProject(info, resolved)) return true;
  }
  return false;
}
