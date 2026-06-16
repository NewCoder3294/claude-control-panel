import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeFakeClaudeDir, fakeProjectPaths } from "./setup.ts";

makeFakeClaudeDir();
const F = fakeProjectPaths();

const {
  slugForPath,
  discoverProjects,
  isProjectScopedPath,
  projectBySlug,
} = await import("../lib/projects.ts");
const projectsApi = await import("../api/projects.ts");
const { ApiHttpError } = await import("../api/errors.ts");

describe("slugForPath", () => {
  it("replaces every non-alphanumeric char with a dash", () => {
    expect(slugForPath("/Users/x/proj-a")).toBe("-Users-x-proj-a");
    expect(slugForPath("/a/b c.d")).toBe("-a-b-c-d");
  });
});

describe("discoverProjects", () => {
  it("returns real projects, excluding missing dirs and HOME", () => {
    const slugs = discoverProjects().map((p) => p.slug);
    expect(slugs).toContain(F.alphaSlug);
    expect(slugs).toContain(F.bravoSlug);
    // ghost dir does not exist; HOME is excluded.
    expect(slugs.some((s) => s.includes("ghost"))).toBe(false);
  });

  it("computes memory dir + session activity for a project", () => {
    const alpha = projectBySlug(F.alphaSlug);
    expect(alpha).not.toBeNull();
    expect(alpha!.memoryDir).toBe(join(F.claude, "projects", F.alphaSlug, "memory"));
    expect(alpha!.sessionCount).toBe(1);
    expect(alpha!.lastActive).not.toBeNull();
  });
});

describe("isProjectScopedPath", () => {
  it("allows files inside a project's writable roots", () => {
    expect(isProjectScopedPath(join(F.alpha, "CLAUDE.md"))).toBe(true);
    expect(isProjectScopedPath(join(F.alpha, ".mcp.json"))).toBe(true);
    expect(isProjectScopedPath(join(F.alpha, ".claude", "settings.json"))).toBe(
      true,
    );
    expect(
      isProjectScopedPath(join(F.claude, "projects", F.alphaSlug, "memory", "n.md")),
    ).toBe(true);
  });

  it("rejects paths outside any project", () => {
    expect(isProjectScopedPath("/etc/hosts")).toBe(false);
    // A sibling file in the project root but not an allowed target.
    expect(isProjectScopedPath(join(F.alpha, "secret.txt"))).toBe(false);
  });
});

describe("projectDetail", () => {
  it("surfaces fixed files (existing + missing-with-template) and named files", async () => {
    const detail = await projectsApi.projectDetail(F.alphaSlug);

    const instructions = detail.groups.find((g) => g.surface === "instructions")!;
    const rootMd = instructions.files.find((f) => f.label === "CLAUDE.md")!;
    expect(rootMd.exists).toBe(true);
    const dotMd = instructions.files.find((f) => f.label === ".claude/CLAUDE.md")!;
    expect(dotMd.exists).toBe(false);
    expect(dotMd.content).toContain("# proj-alpha");

    const mcp = detail.groups.find((g) => g.surface === "mcp")!;
    expect(mcp.files[0]!.exists).toBe(false);
    expect(mcp.files[0]!.content).toContain('"mcpServers"');

    const commands = detail.groups.find((g) => g.surface === "commands")!;
    expect(commands.files.map((f) => f.label)).toContain("build");
  });

  it("reports configKinds in the project list; empty project has none", async () => {
    const { projects } = await projectsApi.listProjects();
    const alpha = projects.find((p) => p.slug === F.alphaSlug)!;
    expect(alpha.configKinds).toContain("instructions");
    expect(alpha.configKinds).toContain("settings");
    expect(alpha.configKinds).toContain("commands");

    const bravo = projects.find((p) => p.slug === F.bravoSlug)!;
    expect(bravo.configKinds).toEqual([]);
  });

  it("rejects an unknown slug", async () => {
    await expect(projectsApi.projectDetail("nope")).rejects.toBeInstanceOf(
      ApiHttpError,
    );
  });
});

describe("project file CRUD", () => {
  it("creates, renames, and deletes a named command (delete -> trash)", async () => {
    const created = await projectsApi.projectFileCreate({
      slug: F.alphaSlug,
      surface: "commands",
      name: "deploy",
    });
    expect(created.ok).toBe(true);
    const cmdPath = join(F.alpha, ".claude", "commands", "deploy.md");
    expect(existsSync(cmdPath)).toBe(true);

    const renamed = await projectsApi.projectFileRename({
      path: cmdPath,
      newName: "release",
    });
    expect(renamed.ok).toBe(true);
    expect(existsSync(cmdPath)).toBe(false);
    const releasePath = join(F.alpha, ".claude", "commands", "release.md");
    expect(existsSync(releasePath)).toBe(true);

    const deleted = await projectsApi.projectFileDelete({ path: releasePath });
    expect(deleted.ok).toBe(true);
    expect(deleted.trash).toBeDefined();
    expect(existsSync(releasePath)).toBe(false);

    const trashRoot = join(F.claude, ".control-panel-trash");
    expect(readdirSync(trashRoot).length).toBeGreaterThan(0);
  });

  it("refuses to create outside a project's scope", async () => {
    await expect(
      projectsApi.projectFileDelete({ path: "/etc/hosts" }),
    ).rejects.toBeInstanceOf(ApiHttpError);
    await expect(
      projectsApi.projectFileRename({ path: "/etc/hosts", newName: "x" }),
    ).rejects.toBeInstanceOf(ApiHttpError);
  });
});
