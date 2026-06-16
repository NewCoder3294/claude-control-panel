/**
 * /api/memory — the auto-memory index + per-topic memory files.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MEMORY_DIR, collapseHome } from "../config.ts";
import { listDir, toConfigFile } from "../lib/fsutil.ts";
import {
  MemoryResponse,
  type ConfigFile,
} from "../../../shared/contracts.ts";

export async function memory(): Promise<MemoryResponse> {
  const indexPath = join(MEMORY_DIR, "MEMORY.md");
  const index: ConfigFile | null = existsSync(indexPath)
    ? toConfigFile({ path: indexPath, label: "MEMORY.md", editable: true })
    : null;

  const files = listDir(MEMORY_DIR, "files")
    .filter((n) => n.endsWith(".md") && n !== "MEMORY.md")
    .sort()
    .map((name) =>
      toConfigFile({
        path: join(MEMORY_DIR, name),
        label: name.replace(/\.md$/, ""),
        editable: true,
      }),
    );

  return MemoryResponse.parse({
    dir: MEMORY_DIR,
    displayDir: collapseHome(MEMORY_DIR),
    index,
    files,
  });
}
