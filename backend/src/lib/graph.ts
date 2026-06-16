/**
 * Build the config knowledge graph from the existing api modules' data.
 * No HTTP knowledge. Node ids are stable (e.g. "memory:<name>") so the UI can
 * deep-link and so edges can reference them across rebuilds.
 */
import { basename } from "node:path";
import { readClaudeJsonMcp } from "./mcpCli.ts";
import { instructions } from "../api/instructions.ts";
import { memory } from "../api/memory.ts";
import { skills } from "../api/skills.ts";
import { commands } from "../api/commands.ts";
import { agents } from "../api/agents.ts";
import type {
  GraphEdge,
  GraphNode,
  GraphResponse,
} from "../../../shared/contracts.ts";

const GLOBAL_ID = "claude-md:global";
const SETTINGS_ID = "settings:global";

/** Normalize a memory wikilink target / filename into a comparable slug. */
function memorySlug(raw: string): string {
  return raw
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase();
}

/** Extract `[[wikilink]]` and `[label](file.md)` targets from a memory body. */
function extractMemoryLinks(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (m[1]) out.push(m[1].split("|")[0] ?? m[1]);
  }
  for (const m of body.matchAll(/\]\(([^)]+\.md)\)/g)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export async function buildGraph(): Promise<GraphResponse> {
  const [instr, mem, sk, cmds, ag] = await Promise.all([
    instructions(),
    memory(),
    skills(),
    commands(),
    agents(),
  ]);
  const { managed, disabled } = readClaudeJsonMcp();

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // --- Global CLAUDE.md + settings (startup) ---
  if (instr.global.exists) {
    nodes.push({
      id: GLOBAL_ID,
      label: "Global CLAUDE.md",
      type: "claude-md",
      group: "startup",
      path: instr.global.path,
      surface: "instructions",
    });
  }
  nodes.push({
    id: SETTINGS_ID,
    label: "settings.json",
    type: "settings",
    group: "startup",
    path: null,
    surface: "settings",
  });
  if (instr.global.exists) {
    edges.push({
      id: `e:${GLOBAL_ID}->${SETTINGS_ID}`,
      source: GLOBAL_ID,
      target: SETTINGS_ID,
      label: "loads",
    });
  }

  // --- Rules (startup), loaded by global CLAUDE.md ---
  for (const rule of instr.rules) {
    const id = `rule:${rule.label}`;
    nodes.push({
      id,
      label: rule.label,
      type: "rule",
      group: "startup",
      path: rule.path,
      surface: "instructions",
    });
    if (instr.global.exists) {
      edges.push({
        id: `e:${GLOBAL_ID}->${id}`,
        source: GLOBAL_ID,
        target: id,
        label: "loads",
      });
    }
  }

  // --- Project CLAUDE.md files (startup) ---
  for (const proj of instr.projects) {
    const projId = `project:${proj.label}`;
    const mdId = `claude-md:${proj.label}`;
    nodes.push({
      id: projId,
      label: proj.label,
      type: "project",
      group: "startup",
      path: null,
      surface: "instructions",
    });
    nodes.push({
      id: mdId,
      label: `${proj.label} · CLAUDE.md`,
      type: "claude-md",
      group: "startup",
      path: proj.path,
      surface: "instructions",
    });
    edges.push({
      id: `e:${projId}->${mdId}`,
      source: projId,
      target: mdId,
      label: "has",
    });
  }

  // --- Memory files (startup) + wikilink edges ---
  const memEntries = [
    ...(mem.index ? [{ file: mem.index, name: "MEMORY" }] : []),
    ...mem.files.map((f) => ({ file: f, name: f.label })),
  ];
  // slug -> node id, for resolving wikilink targets.
  const memBySlug = new Map<string, string>();
  for (const { file, name } of memEntries) {
    const id = `memory:${name}`;
    memBySlug.set(memorySlug(name), id);
    memBySlug.set(memorySlug(basename(file.path)), id);
  }
  for (const { file, name } of memEntries) {
    const id = `memory:${name}`;
    nodes.push({
      id,
      label: name,
      type: "memory",
      group: "startup",
      path: file.path,
      surface: "memory",
    });
  }
  for (const { file, name } of memEntries) {
    const sourceId = `memory:${name}`;
    const seen = new Set<string>();
    for (const link of extractMemoryLinks(file.content)) {
      const targetId = memBySlug.get(memorySlug(basename(link)));
      if (!targetId || targetId === sourceId || seen.has(targetId)) continue;
      seen.add(targetId);
      edges.push({
        id: `e:${sourceId}->link->${targetId}`,
        source: sourceId,
        target: targetId,
        label: "link",
      });
    }
  }

  // --- Skills (on-demand) ---
  for (const skill of sk.active) {
    nodes.push({
      id: `skill:${skill.name}`,
      label: skill.name,
      type: "skill",
      group: "on-demand",
      path: skill.path,
      surface: "skills",
    });
  }

  // --- Commands (on-demand) ---
  for (const cmd of cmds.commands) {
    nodes.push({
      id: `command:${cmd.label}`,
      label: cmd.label,
      type: "command",
      group: "on-demand",
      path: cmd.path,
      surface: "commands",
    });
  }

  // --- Agents (on-demand) ---
  for (const agent of ag.agents) {
    nodes.push({
      id: `agent:${agent.name}`,
      label: agent.name,
      type: "agent",
      group: "on-demand",
      path: agent.path,
      surface: "agents",
    });
  }

  // --- MCP servers (startup), fast path from claude.json names ---
  const mcpNames = new Set<string>([...managed, ...disabled]);
  for (const mcpName of mcpNames) {
    nodes.push({
      id: `mcp:${mcpName}`,
      label: mcpName,
      type: "mcp",
      group: "startup",
      path: null,
      surface: "mcp",
    });
  }

  return { nodes, edges };
}
