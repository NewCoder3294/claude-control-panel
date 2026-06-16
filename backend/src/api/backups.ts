/**
 * /api/backups — browse the backup index and restore a backup over its origin.
 * Restore backs up the CURRENT target first, then copies the backup into place.
 * Restore targets are guarded to stay under CLAUDE_DIR (or editable project files).
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { BACKUP_INDEX, backupFile, type BackupMeta } from "../lib/backup.ts";
import { readText } from "../lib/fsutil.ts";
import { resolveUnderClaude } from "../lib/pathguard.ts";
import { collapseHome } from "../config.ts";
import { projectInstructionFiles } from "./instructions.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import {
  BackupsResponse,
  OkResponse,
  type BackupEntry,
  type BackupRestoreRequest,
} from "../../../shared/contracts.ts";

function isBackupMeta(x: unknown): x is BackupMeta {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.originalPath === "string" &&
    typeof o.timestamp === "string" &&
    typeof o.bytes === "number" &&
    typeof o.backupPath === "string"
  );
}

export async function list(): Promise<BackupsResponse> {
  const raw = readText(BACKUP_INDEX);
  const backups: BackupEntry[] = [];
  if (raw !== null) {
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!isBackupMeta(parsed)) continue;
        // Only surface backups whose copy still exists on disk.
        if (!existsSync(parsed.backupPath)) continue;
        backups.push({
          timestamp: parsed.timestamp,
          originalPath: parsed.originalPath,
          displayOriginalPath: collapseHome(parsed.originalPath),
          backupPath: parsed.backupPath,
          bytes: parsed.bytes,
        });
      } catch {
        // skip malformed index lines
      }
    }
  }
  // Newest first.
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return BackupsResponse.parse({ backups });
}

export async function restore(req: BackupRestoreRequest): Promise<OkResponse> {
  const backupPath = req.backupPath;
  if (backupPath.includes("\0")) throw badRequest("Path contains a null byte");
  if (!existsSync(backupPath)) {
    throw notFound(`Backup not found: ${collapseHome(backupPath)}`);
  }

  const allowed = projectInstructionFiles().map((f) => f.path);
  let target: string;
  try {
    target = resolveUnderClaude(req.originalPath, allowed);
  } catch {
    throw forbidden(
      `Restore target outside permitted scope: ${req.originalPath}`,
    );
  }

  // Back up the current target (if present) before overwriting it.
  backupFile(target);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(backupPath, target);

  // Touch stat to confirm the copy landed.
  try {
    statSync(target);
  } catch {
    throw new Error("Restore copy did not land");
  }

  return OkResponse.parse({ ok: true });
}
