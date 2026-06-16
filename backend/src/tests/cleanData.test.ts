// CCP_CLAUDE_DIR and CCP_CLEAN_DIR MUST be set before any dynamic import of
// config.ts.  config.ts resolves all paths once at module load and Bun caches
// modules across the whole test process (parallel workers share the cache), so
// if any test file imports config before these vars are set every other test
// that relies on the fake dirs will break.
import { describe, expect, it } from "bun:test";
import { makeFakeClaudeDir, makeFakeCleanDir } from "./setup.ts";

makeFakeClaudeDir(); // ensures CCP_CLAUDE_DIR is set before config resolves
const CLEAN = makeFakeCleanDir();
process.env.CCP_CLEAN_DIR = CLEAN; // memoized fixture already sets this; explicit for clarity

const { readFixInbox, readScore, readProjects } = await import("../lib/cleanData.ts");
const { FIXES_DIR, SCORING_DIR, METADATA_DB } = await import("../config.ts");

describe("cleanData readers", () => {
  it("reads a fix inbox file by project_id", () => {
    const fixes = readFixInbox(FIXES_DIR, "owner--repo--main");
    expect(fixes.length).toBe(2);
    expect(fixes[0]!.bad_symbol).toBe("load_indx");
  });

  it("returns [] for a missing inbox", () => {
    expect(readFixInbox(FIXES_DIR, "nope")).toEqual([]);
  });

  it("reads a score by project_id", () => {
    expect(readScore(SCORING_DIR, "owner--repo--main")!.overall_score).toBe(73);
  });

  it("reads the projects table from metadata.db", () => {
    const projects = readProjects(METADATA_DB);
    const repo = projects.find((p) => p.project_id === "owner--repo--main")!;
    expect(repo.repo_full_name).toBe("owner/repo");
    expect(repo.local_path).toBe("/repo");
    expect(repo.entity_count).toBe(1115);
  });

  it("returns [] when metadata.db is absent", () => {
    expect(readProjects("/no/such.db")).toEqual([]);
  });

  it("returns null for a missing score", () => {
    expect(readScore(SCORING_DIR, "nope")).toBeNull();
  });
});
