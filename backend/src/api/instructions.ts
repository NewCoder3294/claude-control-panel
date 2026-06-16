/**
 * /api/instructions — global CLAUDE.md, per-project CLAUDE.md, and rules.
 */
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  GLOBAL_CLAUDE_MD,
  PROJECTS_DIR,
  RULES_DIR,
} from "../config.ts";
import { listDir, toConfigFile } from "../lib/fsutil.ts";
import {
  InstructionsResponse,
  type ConfigFile,
} from "../../../shared/contracts.ts";

const PROJECT_CAP = 30;

/**
 * Convert a Claude Code project slug (e.g. "-Users-alice-myproject")
 * back into a filesystem path by replacing leading/separating "-" with "/".
 */
function slugToPath(slug: string): string {
  // Slugs are leading-dash paths: "-Users-foo-bar" -> "/Users/foo/bar".
  return slug.replace(/-/g, "/");
}

/**
 * Discover editable project CLAUDE.md files from Claude Code's own project
 * registry. For each slug, prefer <path>/CLAUDE.md then <path>/.claude/CLAUDE.md.
 * Returns only files that exist, capped for sanity.
 */
export function projectInstructionFiles(): ConfigFile[] {
  const slugs = listDir(PROJECTS_DIR, "dirs");
  const out: ConfigFile[] = [];
  const seen = new Set<string>();

  for (const slug of slugs) {
    if (out.length >= PROJECT_CAP) break;
    const root = slugToPath(slug);
    const candidates = [
      join(root, "CLAUDE.md"),
      join(root, ".claude", "CLAUDE.md"),
    ];
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      // The home-dir slug's ".claude/CLAUDE.md" candidate IS the global file —
      // don't surface it again as a bogus "project" duplicate of Global.
      if (candidate === GLOBAL_CLAUDE_MD) continue;
      if (!existsSync(candidate)) continue;
      seen.add(candidate);
      out.push(
        toConfigFile({
          path: candidate,
          label: basename(root),
          editable: true,
        }),
      );
      break; // one file per project
    }
  }
  return out;
}

export async function instructions(): Promise<InstructionsResponse> {
  const global = toConfigFile({
    path: GLOBAL_CLAUDE_MD,
    label: "Global CLAUDE.md",
    editable: true,
  });

  const rules = listDir(RULES_DIR, "files")
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((name) =>
      toConfigFile({
        path: join(RULES_DIR, name),
        label: name.replace(/\.md$/, ""),
        editable: true,
      }),
    );

  const projects = projectInstructionFiles();

  return InstructionsResponse.parse({ global, projects, rules });
}
