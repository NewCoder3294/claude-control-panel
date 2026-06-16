/**
 * Path-traversal guard shared by every mutation surface. No HTTP knowledge —
 * callers translate a thrown Error into the appropriate HTTP status.
 */
import { resolve } from "node:path";
import { CLAUDE_DIR } from "../config.ts";

/** True if `target` (already resolved) sits at or under `dir`. */
export function isInside(dir: string, target: string): boolean {
  const d = resolve(dir);
  return target === d || target.startsWith(d + "/");
}

/**
 * Resolve `p` and assert it lives under CLAUDE_DIR (optionally widened by
 * `extraAllowed` exact paths, e.g. editable project CLAUDE.md files).
 * Throws on a null byte or an out-of-scope path. Returns the resolved path.
 */
export function resolveUnderClaude(
  p: string,
  extraAllowed: readonly string[] = [],
): string {
  if (p.includes("\0")) throw new Error("Path contains a null byte");
  const resolved = resolve(p);
  if (isInside(CLAUDE_DIR, resolved)) return resolved;
  if (extraAllowed.includes(resolved)) return resolved;
  throw new Error(`Path outside permitted scope: ${resolved}`);
}
