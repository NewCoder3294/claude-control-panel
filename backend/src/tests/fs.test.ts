import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeClaudeDir } from "./setup.ts";

const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const fsApi = await import("../api/fs.ts");
const { ApiHttpError } = await import("../api/errors.ts");

describe("fs CRUD", () => {
  it("creates, renames, and deletes a command (delete lands in trash)", async () => {
    const created = await fsApi.create({
      kind: "command",
      name: "newcmd",
      content: "# new\n",
    });
    expect(created.ok).toBe(true);
    const cmdPath = join(CLAUDE, "commands", "newcmd.md");
    expect(readFileSync(cmdPath, "utf8")).toBe("# new\n");

    // Rename keeps the extension.
    const renamed = await fsApi.rename({ path: cmdPath, newName: "renamed" });
    expect(renamed.ok).toBe(true);
    expect(existsSync(cmdPath)).toBe(false);
    const renamedPath = join(CLAUDE, "commands", "renamed.md");
    expect(existsSync(renamedPath)).toBe(true);

    // Delete moves to trash rather than hard-deleting.
    const deleted = await fsApi.del({ path: renamedPath });
    expect(deleted.ok).toBe(true);
    expect(deleted.trash).toBeDefined();
    expect(existsSync(renamedPath)).toBe(false);

    const trashRoot = join(CLAUDE, ".control-panel-trash");
    const stamps = readdirSync(trashRoot);
    expect(stamps.length).toBeGreaterThan(0);
    const trashedFile = join(trashRoot, stamps[0]!, "renamed.md");
    expect(existsSync(trashedFile)).toBe(true);
  });

  it("refuses to create a duplicate", async () => {
    await fsApi.create({ kind: "rule", name: "dup", content: "x" });
    await expect(
      fsApi.create({ kind: "rule", name: "dup", content: "y" }),
    ).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("rejects path-traversal on delete", async () => {
    await expect(fsApi.del({ path: "/etc/hosts" })).rejects.toBeInstanceOf(
      ApiHttpError,
    );
  });
});
