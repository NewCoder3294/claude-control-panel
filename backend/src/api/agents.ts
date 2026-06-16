/**
 * /api/agents — subagent definitions in ~/.claude/agents/*.md.
 * GET lists + parses frontmatter; POST (writeAgent) composes + writes one,
 * backing up any existing file and renaming when the name changes.
 */
import { existsSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { AGENTS_DIR, collapseHome } from "../config.ts";
import { listDir, readText } from "../lib/fsutil.ts";
import { backupFile } from "../lib/backup.ts";
import { composeFrontmatter, parseFrontmatter } from "../lib/frontmatter.ts";
import { resolveUnderClaude } from "../lib/pathguard.ts";
import { badRequest, notFound } from "./errors.ts";
import {
  AgentsResponse,
  type AgentSpec,
  type AgentWriteRequest,
} from "../../../shared/contracts.ts";

const AGENT_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function parseAgentFile(path: string, fallbackName: string): AgentSpec {
  const text = readText(path) ?? "";
  const { fields, body } = parseFrontmatter(text);
  let mtime: string | null = null;
  try {
    mtime = statSync(path).mtime.toISOString();
  } catch {
    // missing/unreadable — leave null
  }
  return {
    name: fields.name?.trim() || fallbackName,
    path,
    displayPath: collapseHome(path),
    description: fields.description ?? "",
    tools: fields.tools ?? "",
    model: fields.model ?? "",
    prompt: body.trimStart(),
    mtime,
  };
}

export async function agents(): Promise<AgentsResponse> {
  const specs = listDir(AGENTS_DIR, "files")
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((name) => parseAgentFile(join(AGENTS_DIR, name), name.replace(/\.md$/, "")));

  return AgentsResponse.parse({
    agents: specs,
    dir: AGENTS_DIR,
    displayDir: collapseHome(AGENTS_DIR),
  });
}

export async function writeAgent(req: AgentWriteRequest): Promise<AgentsResponse> {
  const name = req.name.trim();
  if (!AGENT_NAME_RE.test(name)) {
    throw badRequest(`Invalid agent name: ${name}`);
  }

  const targetPath = resolveUnderClaude(join(AGENTS_DIR, `${name}.md`));
  mkdirSync(AGENTS_DIR, { recursive: true });

  const content = composeFrontmatter(
    [
      ["name", name],
      ["description", req.description],
      ["tools", req.tools],
      ["model", req.model],
    ],
    req.prompt,
  );

  // Back up the file we're about to overwrite (if any).
  if (existsSync(targetPath)) backupFile(targetPath);
  writeFileSync(targetPath, content, "utf8");

  // Handle rename: remove/rename the old file when the name changed.
  const original = req.originalName?.trim();
  if (original && original !== name) {
    if (!AGENT_NAME_RE.test(original)) {
      throw badRequest(`Invalid original agent name: ${original}`);
    }
    const oldPath = resolveUnderClaude(join(AGENTS_DIR, `${original}.md`));
    if (existsSync(oldPath) && basename(oldPath) !== basename(targetPath)) {
      backupFile(oldPath);
      try {
        unlinkSync(oldPath);
      } catch {
        // already gone — fine
      }
    }
  }

  return agents();
}

/** Delete an agent by name (moves nothing; callers use fs.del for trash). */
export async function renameAgentFile(from: string, to: string): Promise<void> {
  if (!AGENT_NAME_RE.test(from) || !AGENT_NAME_RE.test(to)) {
    throw badRequest("Invalid agent name");
  }
  const fromPath = resolveUnderClaude(join(AGENTS_DIR, `${from}.md`));
  const toPath = resolveUnderClaude(join(AGENTS_DIR, `${to}.md`));
  if (!existsSync(fromPath)) throw notFound(`Agent not found: ${from}`);
  renameSync(fromPath, toPath);
}
