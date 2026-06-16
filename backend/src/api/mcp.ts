/**
 * /api/mcp — MCP server inventory via `claude mcp list` + ~/.claude.json,
 * plus local add/remove (user scope). claude.ai-scoped connectors are refused.
 */
import { CLAUDE_JSON } from "../config.ts";
import { isManagedLocally, listMcpServers, runClaude } from "../lib/mcpCli.ts";
import { backupFile } from "../lib/backup.ts";
import { badRequest, forbidden } from "./errors.ts";
import { ApiHttpError } from "./errors.ts";
import {
  McpResponse,
  type McpAddRequest,
  type McpRemoveRequest,
} from "../../../shared/contracts.ts";

const NAME_RE = /^[a-zA-Z0-9._:-]+$/;

export async function mcp(): Promise<McpResponse> {
  const { servers, disabled } = await listMcpServers();
  return McpResponse.parse({ servers, disabled });
}

/** Split a stdio command string into argv (whitespace-separated). */
function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

export async function mcpAdd(req: McpAddRequest): Promise<McpResponse> {
  const name = req.name.trim();
  if (!NAME_RE.test(name)) throw badRequest(`Invalid server name: ${name}`);

  let args: string[];
  if (req.transport === "http") {
    const url = req.url.trim();
    if (!/^https?:\/\//.test(url)) {
      throw badRequest("http transport requires an http(s) url");
    }
    args = ["mcp", "add", "--transport", "http", name, url, "-s", "user"];
  } else {
    const cmd = splitCommand(req.command);
    if (cmd.length === 0) {
      throw badRequest("stdio transport requires a command");
    }
    args = ["mcp", "add", name, "-s", "user", "--", ...cmd];
  }

  backupFile(CLAUDE_JSON);
  const result = await runClaude(args);
  if (!result.ok) {
    const detail = (result.stderr || result.stdout).trim();
    throw new ApiHttpError(500, `claude mcp add failed: ${detail || "unknown error"}`);
  }
  return mcp();
}

export async function mcpRemove(req: McpRemoveRequest): Promise<McpResponse> {
  const name = req.name.trim();
  if (!NAME_RE.test(name)) throw badRequest(`Invalid server name: ${name}`);

  if (!isManagedLocally(name)) {
    throw forbidden(
      `Server "${name}" is not managed locally (manage it in the claude.ai app).`,
    );
  }

  backupFile(CLAUDE_JSON);
  const result = await runClaude(["mcp", "remove", name, "-s", "user"]);
  if (!result.ok) {
    const detail = (result.stderr || result.stdout).trim();
    throw new ApiHttpError(
      500,
      `claude mcp remove failed: ${detail || "unknown error"}`,
    );
  }
  return mcp();
}
