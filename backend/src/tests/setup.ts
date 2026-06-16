/**
 * Test fixture: build a throwaway ~/.claude structure and point CCP_CLAUDE_DIR
 * at it BEFORE any module that reads config is imported.
 *
 * config.ts resolves CLAUDE_DIR once at import time, and Bun caches modules
 * across test files in a single process. So every test file MUST share one
 * fixture dir. `makeFakeClaudeDir()` is memoized: the first caller builds the
 * dir and sets the env var; later callers get the same path. Each test file
 * scopes its writes to distinct files/dirs to avoid cross-test interference.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";

/** Slug transform mirrored from lib/projects (kept inline to avoid importing
 * config-dependent modules before the test env is set). */
const fakeSlug = (p: string): string => p.replace(/[^a-zA-Z0-9]/g, "-");

let cached: string | null = null;

export function makeFakeClaudeDir(): string {
  if (cached) return cached;

  const root = mkdtempSync(join(tmpdir(), "ccp-test-"));
  const claude = join(root, ".claude");

  mkdirSync(join(claude, "rules"), { recursive: true });
  mkdirSync(join(claude, "skills", "alpha"), { recursive: true });
  mkdirSync(join(claude, "skills-archive"), { recursive: true });
  mkdirSync(join(claude, "commands"), { recursive: true });
  mkdirSync(join(claude, "agents"), { recursive: true });
  mkdirSync(join(claude, "projects", "-tmp-proj", "memory"), {
    recursive: true,
  });

  writeFileSync(join(claude, "CLAUDE.md"), "# Global\nbe nice\n");
  writeFileSync(join(claude, "rules", "git.md"), "# git rules\n");
  writeFileSync(
    join(claude, "skills", "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: Alpha does things\n---\n# Alpha\n",
  );
  writeFileSync(join(claude, "settings.json"), '{\n  "theme": "dark"\n}\n');
  writeFileSync(join(claude, "commands", "x.md"), "# x command\n");
  writeFileSync(
    join(claude, "agents", "reviewer.md"),
    "---\nname: reviewer\ndescription: Reviews code\ntools: Read, Grep\nmodel: opus\n---\n# Reviewer\nDo a review.\n",
  );
  // MEMORY index links to topic.md via a wikilink target matching its slug.
  writeFileSync(
    join(claude, "projects", "-tmp-proj", "memory", "MEMORY.md"),
    "# Memory Index\n- [[topic]] — a topic note\n",
  );
  writeFileSync(
    join(claude, "projects", "-tmp-proj", "memory", "topic.md"),
    "# Topic\n",
  );

  // ---- Project workspace fixtures ----
  // alpha: a project with several config surfaces + registry memory/session.
  // bravo: a real but empty project (discovered, zero config).
  const alpha = join(root, "proj-alpha");
  const bravo = join(root, "proj-bravo");
  mkdirSync(join(alpha, ".claude", "commands"), { recursive: true });
  writeFileSync(join(alpha, "CLAUDE.md"), "# alpha\n");
  writeFileSync(join(alpha, ".claude", "settings.json"), "{}\n");
  writeFileSync(join(alpha, ".claude", "commands", "build.md"), "# build\n");
  mkdirSync(bravo, { recursive: true });

  const alphaReg = join(claude, "projects", fakeSlug(alpha));
  mkdirSync(join(alphaReg, "memory"), { recursive: true });
  writeFileSync(join(alphaReg, "memory", "note.md"), "# note\n");
  writeFileSync(join(alphaReg, "sess.jsonl"), "{}\n");

  // Registry: two real projects, one ghost (missing on disk), and HOME (excluded).
  writeFileSync(
    join(root, ".claude.json"),
    JSON.stringify({
      projects: {
        [alpha]: {},
        [bravo]: {},
        [join(root, "ghost-project")]: {},
        [homedir()]: {},
      },
    }),
  );

  process.env.CCP_CLAUDE_DIR = claude;
  process.env.CCP_CLAUDE_JSON = join(root, ".claude.json");
  cached = claude;
  return claude;
}

/** Resolved paths/slugs for the project-workspace fixtures. */
export function fakeProjectPaths(): {
  root: string;
  claude: string;
  alpha: string;
  bravo: string;
  alphaSlug: string;
  bravoSlug: string;
} {
  const claude = makeFakeClaudeDir();
  const root = dirname(claude);
  const alpha = join(root, "proj-alpha");
  const bravo = join(root, "proj-bravo");
  return {
    root,
    claude,
    alpha,
    bravo,
    alphaSlug: fakeSlug(alpha),
    bravoSlug: fakeSlug(bravo),
  };
}

let cleanCached: string | null = null;

/** Throwaway ~/.clean with two indexed projects; one has 2 pending fixes. */
export function makeFakeCleanDir(): string {
  if (cleanCached) return cleanCached;
  const root = mkdtempSync(join(tmpdir(), "ccp-clean-"));
  const clean = join(root, ".clean");
  mkdirSync(join(clean, "fixes"), { recursive: true });
  mkdirSync(join(clean, "scoring"), { recursive: true });

  const PID = "owner--repo--main";
  writeFileSync(
    join(clean, "fixes", `${PID}.json`),
    JSON.stringify([
      { id: "a1", file_path: "/repo/svc.py", line: 51, bad_symbol: "load_indx",
        candidates: ["load_index", "load_repo_index"], created_at: "2026-06-15T00:00:00" },
      { id: "b2", file_path: "/repo/hook.py", line: 9, bad_symbol: "warm_modl",
        candidates: ["warm_model"], created_at: "2026-06-15T00:01:00" },
    ]),
  );
  writeFileSync(
    join(clean, "scoring", `${PID}.json`),
    JSON.stringify({ overall_score: 73, overall_label: "REVIEW", stale: false, indexed: true }),
  );
  writeFileSync(
    join(clean, "scoring", "owner--other--main.json"),
    JSON.stringify({ overall_score: 96, overall_label: "OK", stale: false, indexed: true }),
  );

  const db = new Database(join(clean, "metadata.db"));
  // WAL mode mirrors the real Trust-HUD metadata.db and guards the regression
  // where bun:sqlite's { readonly: true } cannot open a WAL database.
  db.run("PRAGMA journal_mode=WAL");
  db.run(
    "CREATE TABLE projects (project_id TEXT, repo_full_name TEXT, branch TEXT, local_path TEXT, entity_count INTEGER, last_indexed_at TEXT)",
  );
  db.run("INSERT INTO projects VALUES (?,?,?,?,?,?)", [PID, "owner/repo", "main", "/repo", 1115, "2026-06-15T00:00:00"]);
  db.run("INSERT INTO projects VALUES (?,?,?,?,?,?)", ["owner--other--main", "owner/other", "main", "/other", 200, "2026-06-15T00:00:00"]);
  db.close();

  process.env.CCP_CLEAN_DIR = clean;
  cleanCached = clean;
  return clean;
}
