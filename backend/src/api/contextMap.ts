/**
 * /api/context-map — a friendly summary of every surface Claude reads, with
 * counts and whether it loads at session startup.
 */
import { instructions } from "./instructions.ts";
import { memory } from "./memory.ts";
import { mcp } from "./mcp.ts";
import { skills } from "./skills.ts";
import { commands } from "./commands.ts";
import { settings } from "./settings.ts";
import {
  ContextMapResponse,
  type ContextMapEntry,
} from "../../../shared/contracts.ts";

export async function contextMap(): Promise<ContextMapResponse> {
  const [instr, mem, mcpData, sk, cmds, set] = await Promise.all([
    instructions(),
    memory(),
    mcp(),
    skills(),
    commands(),
    settings(),
  ]);

  const instructionCount =
    (instr.global.exists ? 1 : 0) + instr.rules.length + instr.projects.length;
  const memoryFileCount = mem.files.length + (mem.index ? 1 : 0);
  const connectedMcp = mcpData.servers.filter(
    (s) => s.status === "connected",
  ).length;
  const settingsCount = 1 + (set.local ? 1 : 0);

  const entries: ContextMapEntry[] = [
    {
      surface: "Instructions",
      summary: `Global CLAUDE.md + ${instr.rules.length} rule${
        instr.rules.length === 1 ? "" : "s"
      } + ${instr.projects.length} project file${
        instr.projects.length === 1 ? "" : "s"
      } — injected at session start.`,
      count: instructionCount,
      loadedAtStartup: true,
    },
    {
      surface: "Memory",
      summary: `${memoryFileCount} memory file${
        memoryFileCount === 1 ? "" : "s"
      }; the index is loaded each session.`,
      count: memoryFileCount,
      loadedAtStartup: true,
    },
    {
      surface: "Skills",
      summary: `${sk.active.length} active skill${
        sk.active.length === 1 ? "" : "s"
      } (${sk.archived.length} archived) — invoked on demand, not preloaded.`,
      count: sk.active.length,
      loadedAtStartup: false,
    },
    {
      surface: "MCP",
      summary: `${mcpData.servers.length} server${
        mcpData.servers.length === 1 ? "" : "s"
      } (${connectedMcp} connected) — tools available throughout the session.`,
      count: mcpData.servers.length,
      loadedAtStartup: true,
    },
    {
      surface: "Commands",
      summary: `${cmds.commands.length} slash command${
        cmds.commands.length === 1 ? "" : "s"
      } — available on demand.`,
      count: cmds.commands.length,
      loadedAtStartup: false,
    },
    {
      surface: "Settings",
      summary: `settings.json${
        set.local ? " + settings.local.json" : ""
      } — applied at startup.`,
      count: settingsCount,
      loadedAtStartup: true,
    },
  ];

  return ContextMapResponse.parse({ entries });
}
