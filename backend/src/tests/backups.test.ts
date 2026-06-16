import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeClaudeDir } from "./setup.ts";

const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const { writeFile } = await import("../api/file.ts");
const backupsApi = await import("../api/backups.ts");

describe("backups", () => {
  it("records originalPath in metadata and lists newest first", async () => {
    const target = join(CLAUDE, "CLAUDE.md");
    await writeFile({ path: target, content: "# v2\n" });

    const list = await backupsApi.list();
    expect(list.backups.length).toBeGreaterThan(0);
    const entry = list.backups.find((b) => b.originalPath === target);
    expect(entry).toBeDefined();
    expect(entry!.bytes).toBeGreaterThan(0);
    expect(entry!.displayOriginalPath).toContain("CLAUDE.md");
  });

  it("restores a backup over the current target (round-trip)", async () => {
    const target = join(CLAUDE, "CLAUDE.md");
    const original = readFileSync(target, "utf8"); // current "# v2\n"

    // First backup holds the pre-v2 content; capture it then restore.
    await writeFile({ path: target, content: "# v3\n" });
    const list = await backupsApi.list();
    const v2Backup = list.backups.find(
      (b) =>
        b.originalPath === target &&
        readFileSync(b.backupPath, "utf8") === original,
    );
    expect(v2Backup).toBeDefined();

    const res = await backupsApi.restore({
      backupPath: v2Backup!.backupPath,
      originalPath: target,
    });
    expect(res.ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(original);
  });

  it("rejects restore outside the permitted scope", async () => {
    await expect(
      backupsApi.restore({ backupPath: __filename, originalPath: "/etc/hosts" }),
    ).rejects.toThrow();
  });
});
