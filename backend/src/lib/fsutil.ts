/**
 * Pure filesystem helpers. No HTTP knowledge.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { collapseHome } from "../config.ts";
import type { ConfigFile } from "../../../shared/contracts.ts";

/** Read a file's text, or null if it does not exist / cannot be read. */
export function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Build a ConfigFile descriptor for a path. Missing files yield exists:false,
 * empty content, 0 bytes, null mtime.
 */
export function toConfigFile(opts: {
  path: string;
  label: string;
  editable: boolean;
}): ConfigFile {
  const { path, label, editable } = opts;
  const content = readText(path);
  const exists = content !== null;
  let mtime: string | null = null;
  let bytes = 0;
  if (exists) {
    try {
      const st = statSync(path);
      mtime = st.mtime.toISOString();
      bytes = st.size;
    } catch {
      // stat failed but we have content — fall back to byte length
      bytes = Buffer.byteLength(content ?? "", "utf8");
    }
  }
  return {
    path,
    label,
    displayPath: collapseHome(path),
    exists,
    content: content ?? "",
    bytes,
    mtime,
    editable,
  };
}

/** List immediate directory entries (names). Returns [] if dir missing. */
export function listDir(
  dir: string,
  kind: "files" | "dirs" | "all" = "all",
): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => {
        if (kind === "files") return e.isFile();
        if (kind === "dirs") return e.isDirectory();
        return true;
      })
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Recursively list absolute file paths under `dir`. Returns [] if missing. */
export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    const entries = listDir(current, "all");
    for (const name of entries) {
      const full = join(current, name);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else out.push(full);
      } catch {
        // entry vanished between listing and stat — skip
      }
    }
  };
  walk(dir);
  return out;
}
