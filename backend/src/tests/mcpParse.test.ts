import { describe, expect, it } from "bun:test";
import { mapStatus, parseMcpList } from "../lib/mcpCli.ts";

const SAMPLE = `Checking MCP server health…

claude.ai Superhuman Mail: https://mcp.mail.superhuman.com/mcp - ! Needs authentication
claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ✔ Connected
supabase: https://mcp.supabase.com/mcp (HTTP) - ✔ Connected
gbrain: /Users/x/.bun/bin/gbrain serve - ✔ Connected
broken: /usr/bin/thing - ✖ Failed to connect`;

describe("parseMcpList", () => {
  it("ignores the health-check header and blank lines", () => {
    const rows = parseMcpList(SAMPLE);
    expect(rows.map((r) => r.name)).toEqual([
      "claude.ai Superhuman Mail",
      "claude.ai Google Drive",
      "supabase",
      "gbrain",
      "broken",
    ]);
  });

  it("maps status text to the contract enum", () => {
    const byName = Object.fromEntries(
      parseMcpList(SAMPLE).map((r) => [r.name, r.status]),
    );
    expect(byName["claude.ai Superhuman Mail"]).toBe("needs-auth");
    expect(byName["claude.ai Google Drive"]).toBe("connected");
    expect(byName["broken"]).toBe("failed");
  });

  it("detects transport from the presence of a URL", () => {
    const byName = Object.fromEntries(
      parseMcpList(SAMPLE).map((r) => [r.name, r.transport]),
    );
    expect(byName["supabase"]).toBe("http");
    expect(byName["gbrain"]).toBe("stdio");
  });
});

describe("mapStatus", () => {
  it("falls back to unknown for unrecognised text", () => {
    expect(mapStatus("something weird")).toBe("unknown");
  });
});
