/**
 * Runs the Trust-HUD `clean-fixes` CLI inside a project's directory. Mirrors
 * lib/mcpCli.ts::runClaude — never throws; spawn failure becomes a non-ok result.
 */
import { CLEAN_FIXES_BIN } from "../config.ts";
import type { CliResult } from "./mcpCli.ts";

export type CleanFixesRunner = (args: string[], cwd: string) => Promise<CliResult>;

export const runCleanFixes: CleanFixesRunner = async (args, cwd) => {
  try {
    const proc = Bun.spawn([CLEAN_FIXES_BIN, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
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
};
