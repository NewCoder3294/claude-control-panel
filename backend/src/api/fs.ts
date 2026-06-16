/**
 * /api/fs — generic create / rename / delete for command, memory and rule
 * files. Deletes are reversible (moved to TRASH_DIR, never hard-deleted).
 * All paths are guarded to stay under CLAUDE_DIR.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import {
  COMMANDS_DIR,
  MEMORY_DIR,
  RULES_DIR,
  TRASH_DIR,
  collapseHome,
} from "../config.ts";
import { backupFile, backupTimestamp } from "../lib/backup.ts";
import { resolveUnderClaude } from "../lib/pathguard.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import {
  OkResponse,
  type FsCreateRequest,
  type FsDeleteRequest,
  type FsKind,
  type FsRenameRequest,
} from "../../../shared/contracts.ts";

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

/** Resolve under CLAUDE_DIR, translating guard failures into a 403. */
function guard(p: string): string {
  try {
    return resolveUnderClaude(p);
  } catch (err) {
    throw forbidden(err instanceof Error ? err.message : String(err));
  }
}

/** Map an FsKind to its directory + file extension. */
function kindTarget(kind: FsKind): { dir: string; ext: string } {
  switch (kind) {
    case "command":
      return { dir: COMMANDS_DIR, ext: ".md" };
    case "memory":
      return { dir: MEMORY_DIR, ext: ".md" };
    case "rule":
      return { dir: RULES_DIR, ext: ".md" };
  }
}

export async function create(req: FsCreateRequest): Promise<OkResponse> {
  const name = req.name.trim();
  if (!NAME_RE.test(name)) throw badRequest(`Invalid name: ${name}`);

  const { dir, ext } = kindTarget(req.kind);
  const target = guard(join(dir, name + ext));
  if (existsSync(target)) {
    throw forbidden(`Already exists: ${collapseHome(target)}`);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(target, req.content ?? "", "utf8");
  return OkResponse.parse({ ok: true });
}

export async function rename(req: FsRenameRequest): Promise<OkResponse> {
  const newName = req.newName.trim();
  if (!NAME_RE.test(newName)) throw badRequest(`Invalid name: ${newName}`);

  const source = guard(req.path);
  if (!existsSync(source)) throw notFound(`Not found: ${collapseHome(source)}`);

  const ext = extname(source);
  const dest = guard(join(source, "..", newName + ext));
  if (existsSync(dest)) {
    throw forbidden(`Already exists: ${collapseHome(dest)}`);
  }

  // Back up the source before moving so the rename is recoverable.
  backupFile(source);
  renameSync(source, dest);
  return OkResponse.parse({ ok: true });
}

export async function del(req: FsDeleteRequest): Promise<OkResponse> {
  const source = guard(req.path);
  if (!existsSync(source)) throw notFound(`Not found: ${collapseHome(source)}`);

  const trashDir = join(TRASH_DIR, backupTimestamp());
  mkdirSync(trashDir, { recursive: true });
  const dest = join(trashDir, basename(source));

  // Move to trash; fall back to copy+remove across devices.
  try {
    renameSync(source, dest);
  } catch {
    cpSync(source, dest, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }

  return OkResponse.parse({ ok: true, trash: collapseHome(dest) });
}
