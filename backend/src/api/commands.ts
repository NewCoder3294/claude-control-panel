/**
 * /api/commands — user slash commands (~/.claude/commands/*.md).
 */
import { join } from "node:path";
import { COMMANDS_DIR } from "../config.ts";
import { listDir, toConfigFile } from "../lib/fsutil.ts";
import { CommandsResponse } from "../../../shared/contracts.ts";

export async function commands(): Promise<CommandsResponse> {
  const cmds = listDir(COMMANDS_DIR, "files")
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((name) =>
      toConfigFile({
        path: join(COMMANDS_DIR, name),
        label: name.replace(/\.md$/, ""),
        editable: true,
      }),
    );
  return CommandsResponse.parse({ commands: cmds });
}
