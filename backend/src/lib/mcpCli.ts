/**
 * Shell + parse `claude mcp list`, cross-referenced with ~/.claude.json.
 * No HTTP knowledge. Never throws — degrades to [] on any failure.
 */
import { CLAUDE_JSON } from "../config.ts";
import { readText } from "./fsutil.ts";
import type { McpServer } from "../../../shared/contracts.ts";

type Status = McpServer["status"];

/** Map free-text status from the CLI into our enum. */
export function mapStatus(text: string): Status {
  const t = text.toLowerCase();
  if (t.includes("needs authentication")) return "needs-auth";
  if (t.includes("connected")) return "connected";
  if (t.includes("fail")) return "failed";
  return "unknown";
}

/** Detail contains an http(s) URL → http transport, else stdio. */
function detectTransport(detail: string): string {
  return /https?:\/\//.test(detail) ? "http" : "stdio";
}

/**
 * Parse the raw stdout of `claude mcp list` into McpServer rows.
 * Each meaningful line looks like: "Name: detail - STATUS".
 * Health-check header / blank lines are ignored.
 */
export function parseMcpList(stdout: string): McpServer[] {
  const servers: McpServer[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Must look like "Name: ... - STATUS". Skip the "Checking ..." header.
    // Separator is colon-SPACE: server names may themselves contain colons
    // (e.g. "plugin:playwright:playwright"), so split on the first ": ".
    const colon = line.indexOf(": ");
    if (colon === -1) continue;
    const lastDash = line.lastIndexOf(" - ");
    if (lastDash === -1 || lastDash < colon) continue;

    const name = line.slice(0, colon).trim();
    const detail = line.slice(colon + 2, lastDash).trim();
    const statusText = line.slice(lastDash + 3).trim();
    if (!name) continue;

    servers.push({
      name,
      scope: "user",
      status: mapStatus(statusText),
      transport: detectTransport(detail),
      detail,
      managedLocally: false,
    });
  }
  return servers;
}

interface ClaudeJson {
  mcpServers?: Record<string, unknown>;
  disabledMcpServers?: string[];
}

/** Safely read mcpServers keys + disabled list from ~/.claude.json. */
export function readClaudeJsonMcp(): {
  managed: Set<string>;
  disabled: string[];
} {
  const raw = readText(CLAUDE_JSON);
  if (raw === null) return { managed: new Set(), disabled: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    const obj = (parsed ?? {}) as ClaudeJson;
    const managed = new Set(Object.keys(obj.mcpServers ?? {}));
    const disabled = Array.isArray(obj.disabledMcpServers)
      ? obj.disabledMcpServers.filter((x): x is string => typeof x === "string")
      : [];
    return { managed, disabled };
  } catch {
    return { managed: new Set(), disabled: [] };
  }
}

/** Run `claude mcp list`, returning stdout or "" on any failure. */
async function runMcpList(): Promise<string> {
  try {
    const proc = Bun.spawn(["claude", "mcp", "list"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return stdout;
  } catch {
    return "";
  }
}

export interface CliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Run an arbitrary `claude` subcommand (e.g. mcp add/remove). Returns the exit
 * status + captured streams. Never throws — translates spawn failure into a
 * non-ok result so the api layer can surface a clean error.
 */
export async function runClaude(args: string[]): Promise<CliResult> {
  try {
    const proc = Bun.spawn(["claude", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { ok: code === 0, stdout, stderr };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, stdout: "", stderr: message };
  }
}

/** True if a name is currently present in ~/.claude.json mcpServers/disabled. */
export function isManagedLocally(name: string): boolean {
  const { managed, disabled } = readClaudeJsonMcp();
  return managed.has(name) || disabled.includes(name);
}

/**
 * Full MCP listing: CLI rows enriched with managedLocally + disabled status.
 * Disabled servers (named in ~/.claude.json disabledMcpServers) are appended if
 * not already present in the CLI output, and forced to status "disabled".
 */
export async function listMcpServers(): Promise<{
  servers: McpServer[];
  disabled: string[];
}> {
  const stdout = await runMcpList();
  const { managed, disabled } = readClaudeJsonMcp();
  const disabledSet = new Set(disabled);

  const servers = parseMcpList(stdout).map((s) => ({
    ...s,
    managedLocally: managed.has(s.name),
    status: disabledSet.has(s.name) ? ("disabled" as Status) : s.status,
  }));

  // Surface disabled servers that no longer appear in the live CLI output.
  const seen = new Set(servers.map((s) => s.name));
  for (const name of disabled) {
    if (seen.has(name)) continue;
    servers.push({
      name,
      scope: "user",
      status: "disabled",
      transport: "stdio",
      detail: "",
      managedLocally: managed.has(name),
    });
  }

  return { servers, disabled };
}
