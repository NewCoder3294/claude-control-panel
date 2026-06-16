/**
 * Timestamped backups taken before any write. No HTTP knowledge.
 *
 * Each backup is copied to BACKUP_DIR/<timestamp>/<basename> AND its origin is
 * recorded: a sibling meta.json next to the copy plus an append-only index at
 * BACKUP_DIR/index.jsonl, so the panel can list + restore backups later.
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { BACKUP_DIR, collapseHome } from "../config.ts";

/** Shape persisted alongside / indexed for each backup. */
export interface BackupMeta {
  originalPath: string;
  timestamp: string;
  bytes: number;
  /** Absolute path to the backup copy on disk. */
  backupPath: string;
}

export const BACKUP_INDEX = join(BACKUP_DIR, "index.jsonl");

/** Filesystem-safe timestamp like 2026-06-14T08-30-00-123Z. */
export function backupTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Copy `absPath` into BACKUP_DIR/<timestamp>/<basename> before it is overwritten.
 * Returns the backup path (with $HOME collapsed). If the source file does not
 * exist, there is nothing to back up and "" is returned.
 */
export function backupFile(absPath: string): string {
  if (!existsSync(absPath)) return "";
  const timestamp = backupTimestamp();
  const base = basename(absPath);
  // Ensure a unique backup dir even when multiple backups land in the same
  // millisecond (the timestamp is the dir name), so rapid/consecutive backups
  // never clobber each other's copy.
  let dir = join(BACKUP_DIR, timestamp);
  let suffix = 1;
  while (existsSync(join(dir, base))) {
    dir = join(BACKUP_DIR, `${timestamp}-${suffix++}`);
  }
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, base);
  copyFileSync(absPath, dest);

  let bytes = 0;
  try {
    bytes = statSync(dest).size;
  } catch {
    // unreadable copy — record 0 bytes rather than failing the write
  }

  const meta: BackupMeta = {
    originalPath: absPath,
    timestamp,
    bytes,
    backupPath: dest,
  };
  try {
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    appendFileSync(BACKUP_INDEX, JSON.stringify(meta) + "\n", "utf8");
  } catch {
    // metadata is best-effort; the copy itself already succeeded
  }

  return collapseHome(dest);
}
