/**
 * Central paths & constants for the Control Panel backend.
 *
 * All values honor env overrides so tests can point at a temp `.claude` dir
 * via `CCP_CLAUDE_DIR` (set BEFORE this module is first imported).
 */
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const HOME = homedir();

export const CLAUDE_DIR = process.env.CCP_CLAUDE_DIR || join(HOME, ".claude");

export const PORT = Number(process.env.CCP_PORT) || 4317;

export const SKILLS_DIR = join(CLAUDE_DIR, "skills");
export const ARCHIVE_DIR = join(CLAUDE_DIR, "skills-archive");
export const COMMANDS_DIR = join(CLAUDE_DIR, "commands");
export const RULES_DIR = join(CLAUDE_DIR, "rules");
export const SETTINGS = join(CLAUDE_DIR, "settings.json");
export const SETTINGS_LOCAL = join(CLAUDE_DIR, "settings.local.json");
export const GLOBAL_CLAUDE_MD = join(CLAUDE_DIR, "CLAUDE.md");
export const BACKUP_DIR = join(CLAUDE_DIR, ".control-panel-backups");
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export const AGENTS_DIR =
  process.env.CCP_AGENTS_DIR || join(CLAUDE_DIR, "agents");
export const TRASH_DIR =
  process.env.CCP_TRASH_DIR || join(CLAUDE_DIR, ".control-panel-trash");
export const GBRAIN_HOOKS_CONFIG =
  process.env.CCP_GBRAIN_HOOKS_CONFIG || join(CLAUDE_DIR, "gbrain-hooks.json");

export const CLAUDE_JSON =
  process.env.CCP_CLAUDE_JSON || join(HOME, ".claude.json");

export const CLEAN_DIR = process.env.CCP_CLEAN_DIR || join(HOME, ".clean");
export const FIXES_DIR = join(CLEAN_DIR, "fixes");
export const SCORING_DIR = join(CLEAN_DIR, "scoring");
export const METADATA_DB = join(CLEAN_DIR, "metadata.db");
export const CLEAN_FIXES_BIN =
  process.env.CCP_CLEAN_FIXES_BIN ||
  join(HOME, "clean-mcp-trust-hud", ".venv", "bin", "clean-fixes");

export const FRONTEND_DIST = resolve(import.meta.dir, "../../frontend/dist");

/**
 * Locate the memory directory: scan CLAUDE_DIR/projects/<slug>/memory for one
 * containing MEMORY.md. Fall back to the canonical default.
 */
function findMemoryDir(): string {
  // Slug = the home path with "/" replaced by "-" (e.g. "/Users/foo" -> "-Users-foo").
  const fallback = join(
    CLAUDE_DIR,
    "projects",
    HOME.replace(/\//g, "-"),
    "memory",
  );
  try {
    const slugs = readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const slug of slugs) {
      if (!slug.isDirectory()) continue;
      const candidate = join(PROJECTS_DIR, slug.name, "memory");
      if (existsSync(join(candidate, "MEMORY.md"))) return candidate;
    }
  } catch {
    // projects dir missing — use fallback
  }
  return fallback;
}

export const MEMORY_DIR = findMemoryDir();

/** Replace the $HOME prefix of an absolute path with "~". */
export function collapseHome(p: string): string {
  if (p === HOME) return "~";
  if (p.startsWith(HOME + "/")) return "~" + p.slice(HOME.length);
  return p;
}
