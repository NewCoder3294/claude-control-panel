/**
 * /api/projects — discover Claude Code projects and manage their scoped config
 * (CLAUDE.md, memory, settings, commands, agents, rules, .mcp.json).
 *
 * Surfaces are either "named" (a directory of user-named .md files) or "fixed"
 * (canonical files like settings.json / .mcp.json). Missing fixed files are
 * surfaced with a template so the UI can offer to create them by saving.
 *
 * Writes go through the shared /api/file path (guarded by isProjectScopedPath).
 * Named create + rename + delete live here, guarded to a project's scope.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { TRASH_DIR, collapseHome } from "../config.ts";
import { backupFile, backupTimestamp } from "../lib/backup.ts";
import { listDir, readText, toConfigFile } from "../lib/fsutil.ts";
import {
  discoverProjects,
  isProjectScopedPath,
  projectBySlug,
  type ProjectInfo,
} from "../lib/projects.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import {
  ProjectDetail,
  ProjectsResponse,
  OkResponse,
  type ConfigFile,
  type FsDeleteRequest,
  type FsRenameRequest,
  type ProjectFileCreateRequest,
  type ProjectFileGroup,
  type ProjectSurfaceId,
} from "../../../shared/contracts.ts";

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

/** Template content for a missing fixed file, keyed by basename. */
function templateFor(name: string, projectName: string): string {
  if (name === ".mcp.json") return '{\n  "mcpServers": {}\n}\n';
  if (name.endsWith(".json")) return "{}\n";
  if (name === "CLAUDE.md") return `# ${projectName}\n\n`;
  return "";
}

/** A fixed file: real ConfigFile if it exists, else a synthetic template stub. */
function fixedFile(path: string, label: string, projectName: string): ConfigFile {
  if (existsSync(path)) return toConfigFile({ path, label, editable: true });
  return {
    path,
    label,
    displayPath: collapseHome(path),
    exists: false,
    content: templateFor(basename(path), projectName),
    bytes: 0,
    mtime: null,
    editable: true,
  };
}

/** List existing *.md files in a directory as editable ConfigFiles. */
function namedFiles(dir: string): ConfigFile[] {
  return listDir(dir, "files")
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((name) =>
      toConfigFile({
        path: join(dir, name),
        label: name.replace(/\.md$/, ""),
        editable: true,
      }),
    );
}

/** The directory backing a named surface, or null for fixed surfaces. */
function namedDir(info: ProjectInfo, surface: ProjectSurfaceId): string | null {
  switch (surface) {
    case "commands":
      return join(info.claudeDir, "commands");
    case "agents":
      return join(info.claudeDir, "agents");
    case "rules":
      return join(info.claudeDir, "rules");
    case "memory":
      return info.memoryDir;
    default:
      return null;
  }
}

/** Build every surface group for a project, in display order. */
function buildGroups(info: ProjectInfo): ProjectFileGroup[] {
  const groups: ProjectFileGroup[] = [];

  // Fixed surfaces.
  groups.push({
    surface: "instructions",
    label: "Instructions",
    createMode: "fixed",
    dir: "",
    displayDir: collapseHome(info.path),
    files: [
      fixedFile(join(info.path, "CLAUDE.md"), "CLAUDE.md", info.name),
      fixedFile(join(info.claudeDir, "CLAUDE.md"), ".claude/CLAUDE.md", info.name),
    ],
  });

  // Named surfaces.
  const named: { surface: ProjectSurfaceId; label: string }[] = [
    { surface: "memory", label: "Memory" },
    { surface: "commands", label: "Commands" },
    { surface: "agents", label: "Agents" },
    { surface: "rules", label: "Rules" },
  ];
  for (const { surface, label } of named) {
    const dir = namedDir(info, surface)!;
    groups.push({
      surface,
      label,
      createMode: "named",
      dir,
      displayDir: collapseHome(dir),
      files: namedFiles(dir),
    });
  }

  groups.push({
    surface: "settings",
    label: "Settings",
    createMode: "fixed",
    dir: "",
    displayDir: collapseHome(info.claudeDir),
    files: [
      fixedFile(join(info.claudeDir, "settings.json"), "settings.json", info.name),
      fixedFile(
        join(info.claudeDir, "settings.local.json"),
        "settings.local.json",
        info.name,
      ),
    ],
  });

  groups.push({
    surface: "mcp",
    label: "MCP",
    createMode: "fixed",
    dir: "",
    displayDir: collapseHome(info.path),
    files: [fixedFile(join(info.path, ".mcp.json"), ".mcp.json", info.name)],
  });

  return groups;
}

/** Surfaces that currently have at least one existing file. */
function configKinds(groups: ProjectFileGroup[]): ProjectSurfaceId[] {
  return groups
    .filter((g) => g.files.some((f) => f.exists))
    .map((g) => g.surface);
}

export async function listProjects(): Promise<ProjectsResponse> {
  const projects = discoverProjects().map((info) => {
    const groups = buildGroups(info);
    return {
      slug: info.slug,
      name: info.name,
      path: info.path,
      displayPath: collapseHome(info.path),
      configKinds: configKinds(groups),
      sessionCount: info.sessionCount,
      lastActive: info.lastActive,
    };
  });
  return ProjectsResponse.parse({ projects });
}

export async function projectDetail(slug: string): Promise<ProjectDetail> {
  const info = projectBySlug(slug);
  if (!info) throw notFound(`Unknown project: ${slug}`);
  const groups = buildGroups(info);
  return ProjectDetail.parse({
    slug: info.slug,
    name: info.name,
    path: info.path,
    displayPath: collapseHome(info.path),
    sessionCount: info.sessionCount,
    lastActive: info.lastActive,
    groups,
  });
}

export async function projectFileCreate(
  req: ProjectFileCreateRequest,
): Promise<OkResponse> {
  const info = projectBySlug(req.slug);
  if (!info) throw notFound(`Unknown project: ${req.slug}`);

  const dir = namedDir(info, req.surface);
  if (!dir) throw badRequest(`Surface "${req.surface}" has no named files`);

  const name = req.name.trim();
  if (!NAME_RE.test(name)) throw badRequest(`Invalid name: ${name}`);

  const target = resolve(join(dir, `${name}.md`));
  if (!isProjectScopedPath(target)) {
    throw forbidden(`Create outside permitted scope: ${target}`);
  }
  if (existsSync(target)) {
    throw forbidden(`Already exists: ${collapseHome(target)}`);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(target, "", "utf8");
  return OkResponse.parse({ ok: true });
}

export async function projectFileRename(
  req: FsRenameRequest,
): Promise<OkResponse> {
  const newName = req.newName.trim();
  if (!NAME_RE.test(newName)) throw badRequest(`Invalid name: ${newName}`);

  const source = resolve(req.path);
  if (!isProjectScopedPath(source)) {
    throw forbidden(`Rename outside permitted scope: ${source}`);
  }
  if (!existsSync(source)) throw notFound(`Not found: ${collapseHome(source)}`);

  const dest = resolve(join(source, "..", `${newName}.md`));
  if (!isProjectScopedPath(dest)) {
    throw forbidden(`Rename target outside permitted scope: ${dest}`);
  }
  if (existsSync(dest)) {
    throw forbidden(`Already exists: ${collapseHome(dest)}`);
  }

  backupFile(source);
  renameSync(source, dest);
  return OkResponse.parse({ ok: true });
}

export async function projectFileDelete(
  req: FsDeleteRequest,
): Promise<OkResponse> {
  const source = resolve(req.path);
  if (!isProjectScopedPath(source)) {
    throw forbidden(`Delete outside permitted scope: ${source}`);
  }
  if (!existsSync(source)) throw notFound(`Not found: ${collapseHome(source)}`);

  const trashDir = join(TRASH_DIR, backupTimestamp());
  mkdirSync(trashDir, { recursive: true });
  const dest = join(trashDir, basename(source));

  try {
    renameSync(source, dest);
  } catch {
    cpSync(source, dest, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }

  return OkResponse.parse({ ok: true, trash: collapseHome(dest) });
}
