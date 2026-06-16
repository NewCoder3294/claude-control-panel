/**
 * Pure readers over ~/.clean — the Trust-HUD's local state. Every reader is
 * best-effort: a missing/malformed file or absent DB yields an empty result,
 * never a throw, so the panel degrades gracefully when the Trust-HUD isn't set up.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

export interface RawFix {
  id: string;
  file_path: string | null;
  line: number | null;
  bad_symbol: string;
  candidates: string[];
  created_at: string;
}

export interface RawScore {
  overall_score: number;
  overall_label: string;
  stale: boolean;
  indexed: boolean;
}

export interface RawProject {
  project_id: string;
  repo_full_name: string | null;
  branch: string | null;
  local_path: string | null;
  entity_count: number | null;
  last_indexed_at: string | null;
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readFixInbox(fixesDir: string, projectId: string): RawFix[] {
  const data = readJson<RawFix[]>(join(fixesDir, `${projectId}.json`));
  return Array.isArray(data) ? data : [];
}

export function readScore(scoringDir: string, projectId: string): RawScore | null {
  return readJson<RawScore>(join(scoringDir, `${projectId}.json`));
}

export function readProjects(metadataDb: string): RawProject[] {
  if (!existsSync(metadataDb)) return [];
  try {
    // NOTE: opened read-write, not { readonly: true }. The Trust-HUD's
    // metadata.db runs in WAL mode (its daemon keeps -wal/-shm sidecars open),
    // and bun:sqlite's readonly mode cannot open a WAL database ("unable to
    // open database file"). We only ever SELECT, so a read-write handle is a
    // passive reader here; SQLite WAL allows a concurrent reader safely.
    const db = new Database(metadataDb);
    try {
      // Cast trusts the DB schema (projects table) hasn't drifted from RawProject.
      return db
        .query(
          "SELECT project_id, repo_full_name, branch, local_path, entity_count, last_indexed_at FROM projects",
        )
        .all() as RawProject[];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}
