/**
 * /api/code-trust — the Trust-HUD fix inbox + per-project trust, read from
 * ~/.clean. Read-only here; mutations go through codeTrustAction (clean-fixes CLI).
 */
import { basename } from "node:path";
import { existsSync } from "node:fs";
import { CLEAN_DIR, FIXES_DIR, SCORING_DIR, METADATA_DB } from "../config.ts";
import {
  readFixInbox,
  readScore,
  readProjects,
  type RawFix,
  type RawProject,
} from "../lib/cleanData.ts";
import {
  CodeTrustResponse,
  CodeTrustAction,
  CodeTrustActionResponse,
  type FixEntry,
  type ProjectTrust,
  type CodeTrustActionResponse as ActionRes,
} from "../../../shared/contracts.ts";
import { runCleanFixes, type CleanFixesRunner } from "../lib/cleanFixes.ts";

function toFixEntry(f: RawFix): FixEntry {
  return {
    id: f.id,
    file: f.file_path || "",
    displayFile: basename(f.file_path || ""),
    line: f.line ?? null,
    badSymbol: f.bad_symbol,
    candidates: Array.isArray(f.candidates) ? f.candidates : [],
    createdAt: f.created_at,
  };
}

function toProjectTrust(p: RawProject): ProjectTrust {
  const score = readScore(SCORING_DIR, p.project_id);
  return {
    projectId: p.project_id,
    repo: p.repo_full_name || p.project_id,
    branch: p.branch,
    localPath: p.local_path,
    score: score?.overall_score ?? null,
    label: score?.overall_label ?? null,
    indexFresh: score ? !score.stale && score.indexed : false,
    entityCount: p.entity_count ?? null,
    fixes: readFixInbox(FIXES_DIR, p.project_id).map(toFixEntry),
  };
}

export function getCodeTrust(): CodeTrustResponse {
  if (!existsSync(CLEAN_DIR)) {
    return CodeTrustResponse.parse({ available: false, projects: [] });
  }
  const projects = readProjects(METADATA_DB)
    .map(toProjectTrust)
    .sort((a, b) => b.fixes.length - a.fixes.length);
  return CodeTrustResponse.parse({ available: true, projects });
}

function classify(stdout: string): ActionRes["status"] {
  const s = stdout.toLowerCase();
  if (s.startsWith("applied")) return "applied";
  if (s.startsWith("skipped")) return "stale";
  if (s.startsWith("rejected")) return "rejected";
  if (s.includes("no pending fix")) return "not-found";
  return "error";
}

export async function codeTrustAction(
  body: unknown,
  run: CleanFixesRunner = runCleanFixes,
): Promise<ActionRes> {
  const req = CodeTrustAction.parse(body);
  const project = readProjects(METADATA_DB).find((p) => p.project_id === req.projectId);
  if (!project?.local_path) {
    return CodeTrustActionResponse.parse({
      status: "error",
      message: `No local path for project ${req.projectId}`,
      data: getCodeTrust(),
    });
  }
  const args = [req.action, req.id, ...(req.pick != null ? ["--pick", String(req.pick)] : [])];
  const result = await run(args, project.local_path);
  const status = result.ok ? classify(result.stdout) : "error";
  return CodeTrustActionResponse.parse({
    status,
    message: (result.stdout || result.stderr).trim(),
    data: getCodeTrust(),
  });
}
