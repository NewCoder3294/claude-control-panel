import { describe, expect, it } from "bun:test";
import { makeFakeClaudeDir } from "./setup.ts";

const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const { graph } = await import("../api/graph.ts");

describe("graph", () => {
  it("builds nodes and edges from existing config surfaces", async () => {
    const g = await graph();
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);

    // Global CLAUDE.md exists in the fixture and should be a node.
    expect(g.nodes.some((n) => n.type === "claude-md")).toBe(true);
    // Memory + rule + skill + agent surfaces are represented.
    expect(g.nodes.some((n) => n.type === "memory")).toBe(true);
    expect(g.nodes.some((n) => n.type === "agent")).toBe(true);
    // Global -> rule "loads" edge exists.
    expect(g.edges.some((e) => e.label === "loads")).toBe(true);
  });

  it("resolves at least one memory wikilink edge", async () => {
    const g = await graph();
    const linkEdges = g.edges.filter((e) => e.label === "link");
    expect(linkEdges.length).toBeGreaterThan(0);

    const edge = linkEdges[0]!;
    const source = g.nodes.find((n) => n.id === edge.source);
    const target = g.nodes.find((n) => n.id === edge.target);
    expect(source?.type).toBe("memory");
    expect(target?.type).toBe("memory");
    // The fixture links MEMORY -> topic.
    expect(g.edges.some((e) => e.target === "memory:topic" && e.label === "link")).toBe(
      true,
    );
  });
});
