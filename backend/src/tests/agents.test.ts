import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeClaudeDir } from "./setup.ts";

const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const { agents, writeAgent } = await import("../api/agents.ts");

describe("agents", () => {
  it("parses an existing agent's frontmatter + body", async () => {
    const res = await agents();
    const reviewer = res.agents.find((a) => a.name === "reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer!.description).toBe("Reviews code");
    expect(reviewer!.tools).toBe("Read, Grep");
    expect(reviewer!.model).toBe("opus");
    expect(reviewer!.prompt).toContain("Do a review.");
  });

  it("writes a new agent and reads it back (round-trip)", async () => {
    const res = await writeAgent({
      name: "planner",
      description: "Plans work",
      tools: "*",
      model: "sonnet",
      prompt: "# Planner\nMake a plan.",
    });
    const planner = res.agents.find((a) => a.name === "planner");
    expect(planner).toBeDefined();
    expect(planner!.model).toBe("sonnet");

    const onDisk = readFileSync(join(CLAUDE, "agents", "planner.md"), "utf8");
    expect(onDisk).toContain("name: planner");
    expect(onDisk).toContain("Make a plan.");
  });

  it("omits empty frontmatter fields", async () => {
    await writeAgent({
      name: "minimal",
      description: "Minimal",
      tools: "",
      model: "",
      prompt: "Body",
    });
    const onDisk = readFileSync(join(CLAUDE, "agents", "minimal.md"), "utf8");
    expect(onDisk).not.toContain("tools:");
    expect(onDisk).not.toContain("model:");
  });

  it("renames the old file when name changes", async () => {
    await writeAgent({
      name: "first",
      description: "d",
      tools: "",
      model: "",
      prompt: "p",
    });
    await writeAgent({
      originalName: "first",
      name: "second",
      description: "d",
      tools: "",
      model: "",
      prompt: "p",
    });
    expect(existsSync(join(CLAUDE, "agents", "first.md"))).toBe(false);
    expect(existsSync(join(CLAUDE, "agents", "second.md"))).toBe(true);
  });
});
