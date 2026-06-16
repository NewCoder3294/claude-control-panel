/**
 * /api/skills — active skills (with SKILL.md) and archived skills.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_DIR, SKILLS_DIR, collapseHome } from "../config.ts";
import { listDir, readText } from "../lib/fsutil.ts";
import { SkillsResponse, type Skill } from "../../../shared/contracts.ts";

/**
 * Pull the `description:` value from a SKILL.md YAML frontmatter block.
 * Handles plain and quoted values. Returns "" when absent.
 */
export function parseSkillDescription(skillMd: string): string {
  const fmMatch = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  const body = fmMatch ? fmMatch[1] : skillMd;
  if (body === undefined) return "";
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*description\s*:\s*(.*)$/);
    if (!m || m[1] === undefined) continue;
    let value = m[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return "";
}

function readSkillsFrom(dir: string, archived: boolean): Skill[] {
  const out: Skill[] = [];
  for (const name of listDir(dir, "dirs")) {
    const skillPath = join(dir, name);
    const skillMdPath = join(skillPath, "SKILL.md");
    const hasManifest = existsSync(skillMdPath);
    // Active skills require a SKILL.md; archived ones are listed regardless.
    if (!archived && !hasManifest) continue;
    const md = hasManifest ? readText(skillMdPath) : null;
    out.push({
      name,
      path: skillPath,
      description: md ? parseSkillDescription(md) : "",
      archived,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function skills(): Promise<SkillsResponse> {
  const active = readSkillsFrom(SKILLS_DIR, false);
  const archived = readSkillsFrom(ARCHIVE_DIR, true);
  return SkillsResponse.parse({
    active,
    archived,
    archiveDir: collapseHome(ARCHIVE_DIR),
  });
}
