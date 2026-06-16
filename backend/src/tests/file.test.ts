import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeFakeClaudeDir } from "./setup.ts";

// Point config at a throwaway .claude BEFORE importing anything that reads it.
const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const { writeFile, skillAction } = await import("../api/file.ts");
const { ApiHttpError } = await import("../api/errors.ts");

describe("writeFile", () => {
  it("backs up the existing file then writes new content", async () => {
    const target = join(CLAUDE, "CLAUDE.md");
    const res = await writeFile({ path: target, content: "# Updated\n" });

    expect(res.ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("# Updated\n");

    // A backup copy of the prior content must exist.
    const backupRoot = join(CLAUDE, ".control-panel-backups");
    const stamps = readdirSync(backupRoot);
    expect(stamps.length).toBeGreaterThan(0);
    expect(res.backup).toContain(".control-panel-backups");
  });

  it("rejects a write that resolves outside the permitted scope", async () => {
    await expect(
      writeFile({ path: "/etc/hosts", content: "x" }),
    ).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("rejects invalid JSON for a .json file under CLAUDE_DIR", async () => {
    const target = join(CLAUDE, "settings.json");
    await expect(
      writeFile({ path: target, content: "{ not json" }),
    ).rejects.toThrow(/Invalid JSON/);
    // Original content must be untouched.
    expect(readFileSync(target, "utf8")).toContain("dark");
  });
});

describe("skillAction", () => {
  it("archives then restores a skill round-trip", async () => {
    const activeDir = join(CLAUDE, "skills", "alpha");
    const archivedDir = join(CLAUDE, "skills-archive", "alpha");

    const afterArchive = await skillAction({ name: "alpha", action: "archive" });
    expect(existsSync(activeDir)).toBe(false);
    expect(existsSync(archivedDir)).toBe(true);
    expect(afterArchive.archived.some((s) => s.name === "alpha")).toBe(true);

    const afterRestore = await skillAction({ name: "alpha", action: "restore" });
    expect(existsSync(activeDir)).toBe(true);
    expect(existsSync(archivedDir)).toBe(false);
    expect(afterRestore.active.some((s) => s.name === "alpha")).toBe(true);
  });

  it("rejects skill names containing path separators", async () => {
    await expect(
      skillAction({ name: "../evil", action: "archive" }),
    ).rejects.toThrow(/Invalid skill name/);
  });
});
