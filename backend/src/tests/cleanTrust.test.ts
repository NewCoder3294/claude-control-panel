import { describe, expect, it } from "bun:test";
import { makeFakeClaudeDir, makeFakeCleanDir } from "./setup.ts";

// Env for BOTH fake dirs must be set before config.ts is dynamically imported
// (config resolves CLAUDE_DIR/CLEAN_DIR once at module load; Bun shares the cache).
makeFakeClaudeDir();
makeFakeCleanDir();

const { getCodeTrust } = await import("../api/clean-trust.ts");

describe("getCodeTrust", () => {
  it("is available and lists projects sorted by pending-fix count desc", () => {
    const res = getCodeTrust();
    expect(res.available).toBe(true);
    expect(res.projects[0]!.projectId).toBe("owner--repo--main"); // 2 fixes first
    expect(res.projects[0]!.fixes.length).toBe(2);
    expect(res.projects[1]!.fixes.length).toBe(0);
    expect(res.projects[1]!.projectId).toBe("owner--other--main");
  });

  it("joins metadata + score + maps fix fields", () => {
    const p = getCodeTrust().projects.find((x) => x.projectId === "owner--repo--main")!;
    expect(p.repo).toBe("owner/repo");
    expect(p.localPath).toBe("/repo");
    expect(p.score).toBe(73);
    expect(p.label).toBe("REVIEW");
    expect(p.indexFresh).toBe(true);
    expect(p.entityCount).toBe(1115);
    expect(p.fixes[0]!.badSymbol).toBe("load_indx");
    expect(p.fixes[0]!.file).toBe("/repo/svc.py");
    expect(p.fixes[0]!.displayFile).toBe("svc.py");
  });
});
