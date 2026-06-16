import { describe, expect, it } from "bun:test";
import { makeFakeClaudeDir, makeFakeCleanDir } from "./setup.ts";

// Both fake dirs must be configured before config.ts is dynamically imported
// (config resolves paths once at module load; Bun shares the cache across files).
makeFakeClaudeDir();
makeFakeCleanDir();

const { codeTrustAction } = await import("../api/clean-trust.ts");

function fakeRunner(out: string) {
  const calls: { args: string[]; cwd: string }[] = [];
  const run = async (args: string[], cwd: string) => {
    calls.push({ args, cwd });
    return { ok: true, stdout: out, stderr: "" };
  };
  return { run, calls };
}

describe("codeTrustAction", () => {
  it("runs clean-fixes apply in the project's local_path and maps 'Applied'", async () => {
    const r = fakeRunner("Applied a1: load_indx → load_index\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "a1", action: "apply" },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["apply", "a1"]);
    expect(r.calls[0]!.cwd).toBe("/repo");
    expect(res.status).toBe("applied");
    expect(res.data.available).toBe(true);
  });

  it("passes --pick and maps a stale result", async () => {
    const r = fakeRunner("Skipped a1 (stale: the symbol is gone ...)\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "a1", action: "apply", pick: 1 },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["apply", "a1", "--pick", "1"]);
    expect(res.status).toBe("stale");
  });

  it("maps reject", async () => {
    const r = fakeRunner("Rejected b2.\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "b2", action: "reject" },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["reject", "b2"]);
    expect(res.status).toBe("rejected");
  });

  it("errors for an unknown project (no local_path)", async () => {
    const r = fakeRunner("");
    const res = await codeTrustAction(
      { projectId: "ghost", id: "a1", action: "apply" },
      r.run,
    );
    expect(res.status).toBe("error");
    expect(r.calls.length).toBe(0);
  });

  it("returns error status when the runner fails", async () => {
    const run = async () => ({ ok: false, stdout: "", stderr: "ENOENT: no such file" });
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "a1", action: "apply" },
      run,
    );
    expect(res.status).toBe("error");
    expect(res.message).toBe("ENOENT: no such file");
  });
});
