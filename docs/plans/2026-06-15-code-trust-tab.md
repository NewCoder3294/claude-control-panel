# Code Trust Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Code Trust" tab to the Control Panel that shows the Trust-HUD fix inbox grouped by project (with a per-project TRUST header) and lets you Apply/Reject fixes from the browser — then make it live.

**Architecture:** A new backend `api/clean-trust.ts` reads `~/.clean/{fixes,scoring}/*.json` + `metadata.db` (via Bun's built-in `bun:sqlite`) and exposes `GET /api/code-trust`; a `POST /api/code-trust/action` shells out to the existing `clean-fixes` CLI (`cwd` = the project's `local_path`) — clean's atomic apply stays the single source of truth. A new React `CodeTrustView` renders it. Phase B = load-on-open + Refresh; Phase C = interval polling.

**Tech Stack:** Bun + TypeScript backend (`bun test`), Vite + React + Tailwind frontend (`tsc -b` typecheck; **no frontend test runner** — verify via typecheck + manual), zod contracts shared in `shared/contracts.ts`.

---

## File Structure

- `backend/src/config.ts` — **modify.** Add `CLEAN_DIR`, `CLEAN_FIXES_BIN`.
- `backend/src/lib/cleanData.ts` — **new.** Pure readers: `readFixInbox`, `readScore`, `readProjects` (sqlite). One responsibility: parse `~/.clean` data into plain objects.
- `backend/src/lib/cleanFixes.ts` — **new.** `runCleanFixes(args, cwd)` — `Bun.spawn` wrapper (mirrors `lib/mcpCli.ts::runClaude`), returns `CliResult`.
- `backend/src/api/clean-trust.ts` — **new.** `getCodeTrust()` (aggregate) + `codeTrustAction(body)` (CLI-backed). Mirrors `api/mcp.ts`.
- `backend/src/server.ts` — **modify.** Register `GET /api/code-trust` + `POST /api/code-trust/action`.
- `shared/contracts.ts` — **modify.** Add `FixEntry`, `ProjectTrust`, `CodeTrustResponse`, `CodeTrustAction`.
- `backend/src/tests/setup.ts` — **modify.** Add memoized `makeFakeCleanDir()`.
- `backend/src/tests/cleanData.test.ts`, `cleanTrust.test.ts`, `cleanTrustAction.test.ts` — **new.**
- `frontend/src/nav.ts` — **modify.** Add `"code-trust"` surface + `NAV_ITEMS` entry.
- `frontend/src/components/icons.tsx` — **modify.** Add `CodeTrustIcon`.
- `frontend/src/App.tsx` — **modify.** Wire `VIEWS` + `SUBTITLES`.
- `frontend/src/api/client.ts` — **modify.** `getCodeTrust`, `codeTrustAction`.
- `frontend/src/lib/useCounts.ts` — **modify.** Track pending-fix count badge.
- `frontend/src/views/CodeTrustView.tsx` — **new.** The two-pane view.

On-disk shapes (read-only inputs):
- `~/.clean/fixes/<project_id>.json` → `[{ id, file_path, line, bad_symbol, candidates, created_at }]`
- `~/.clean/scoring/<project_id>.json` → `{ overall_score, overall_label, stale, indexed, ... }`
- `~/.clean/metadata.db` table `projects(project_id, repo_full_name, branch, local_path, entity_count, last_indexed_at, ...)`

---

## Task B1: Backend config + `~/.clean` data readers

**Files:**
- Modify: `backend/src/config.ts`
- Create: `backend/src/lib/cleanData.ts`
- Modify: `backend/src/tests/setup.ts`
- Create: `backend/src/tests/cleanData.test.ts`

- [ ] **Step 1: Add the test fixture helper.** In `backend/src/tests/setup.ts`, add (uses `bun:sqlite`, built into Bun):

```ts
import { Database } from "bun:sqlite";

let cleanCached: string | null = null;

/** Throwaway ~/.clean with two indexed projects; one has 2 pending fixes. */
export function makeFakeCleanDir(): string {
  if (cleanCached) return cleanCached;
  const root = mkdtempSync(join(tmpdir(), "ccp-clean-"));
  const clean = join(root, ".clean");
  mkdirSync(join(clean, "fixes"), { recursive: true });
  mkdirSync(join(clean, "scoring"), { recursive: true });

  const PID = "owner--repo--main";
  writeFileSync(
    join(clean, "fixes", `${PID}.json`),
    JSON.stringify([
      { id: "a1", file_path: "/repo/svc.py", line: 51, bad_symbol: "load_indx",
        candidates: ["load_index", "load_repo_index"], created_at: "2026-06-15T00:00:00" },
      { id: "b2", file_path: "/repo/hook.py", line: 9, bad_symbol: "warm_modl",
        candidates: ["warm_model"], created_at: "2026-06-15T00:01:00" },
    ]),
  );
  writeFileSync(
    join(clean, "scoring", `${PID}.json`),
    JSON.stringify({ overall_score: 73, overall_label: "REVIEW", stale: false, indexed: true }),
  );
  // Second project: indexed, no fixes.
  writeFileSync(
    join(clean, "scoring", "owner--other--main.json"),
    JSON.stringify({ overall_score: 96, overall_label: "OK", stale: false, indexed: true }),
  );

  const db = new Database(join(clean, "metadata.db"));
  db.run(
    "CREATE TABLE projects (project_id TEXT, repo_full_name TEXT, branch TEXT, local_path TEXT, entity_count INTEGER, last_indexed_at TEXT)",
  );
  db.run(
    "INSERT INTO projects VALUES (?,?,?,?,?,?)",
    [PID, "owner/repo", "main", "/repo", 1115, "2026-06-15T00:00:00"],
  );
  db.run(
    "INSERT INTO projects VALUES (?,?,?,?,?,?)",
    ["owner--other--main", "owner/other", "main", "/other", 200, "2026-06-15T00:00:00"],
  );
  db.close();

  process.env.CCP_CLEAN_DIR = clean;
  cleanCached = clean;
  return clean;
}
```

- [ ] **Step 2: Write the failing test.** Create `backend/src/tests/cleanData.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { makeFakeCleanDir } from "./setup.ts";

const CLEAN = makeFakeCleanDir();
process.env.CCP_CLEAN_DIR = CLEAN;

const { readFixInbox, readScore, readProjects } = await import("../lib/cleanData.ts");
const { FIXES_DIR, SCORING_DIR, METADATA_DB } = await import("../config.ts");

describe("cleanData readers", () => {
  it("reads a fix inbox file by project_id", () => {
    const fixes = readFixInbox(FIXES_DIR, "owner--repo--main");
    expect(fixes.length).toBe(2);
    expect(fixes[0]!.bad_symbol).toBe("load_indx");
  });

  it("returns [] for a missing inbox", () => {
    expect(readFixInbox(FIXES_DIR, "nope")).toEqual([]);
  });

  it("reads a score by project_id", () => {
    expect(readScore(SCORING_DIR, "owner--repo--main")!.overall_score).toBe(73);
  });

  it("reads the projects table from metadata.db", () => {
    const projects = readProjects(METADATA_DB);
    const repo = projects.find((p) => p.project_id === "owner--repo--main")!;
    expect(repo.repo_full_name).toBe("owner/repo");
    expect(repo.local_path).toBe("/repo");
    expect(repo.entity_count).toBe(1115);
  });

  it("returns [] when metadata.db is absent", () => {
    expect(readProjects("/no/such.db")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `cd backend && bun test src/tests/cleanData.test.ts`
Expected: FAIL — `Cannot find module '../lib/cleanData.ts'` (and missing config exports).

- [ ] **Step 4: Add config + implement readers.** In `backend/src/config.ts`, add after the existing exports:

```ts
export const CLEAN_DIR = process.env.CCP_CLEAN_DIR || join(HOME, ".clean");
export const FIXES_DIR = join(CLEAN_DIR, "fixes");
export const SCORING_DIR = join(CLEAN_DIR, "scoring");
export const METADATA_DB = join(CLEAN_DIR, "metadata.db");
export const CLEAN_FIXES_BIN =
  process.env.CCP_CLEAN_FIXES_BIN ||
  join(HOME, "clean-mcp-trust-hud", ".venv", "bin", "clean-fixes");
```

Create `backend/src/lib/cleanData.ts`:

```ts
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
  file_path: string;
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
    const db = new Database(metadataDb, { readonly: true });
    try {
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
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `cd backend && bun test src/tests/cleanData.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add backend/src/config.ts backend/src/lib/cleanData.ts backend/src/tests/setup.ts backend/src/tests/cleanData.test.ts
git commit -m "feat(code-trust): ~/.clean readers (fixes, scoring, projects)"
```

---

## Task B2: Contracts + `getCodeTrust` aggregator

**Files:**
- Modify: `shared/contracts.ts`
- Create: `backend/src/api/clean-trust.ts`
- Create: `backend/src/tests/cleanTrust.test.ts`

- [ ] **Step 1: Add contracts.** Append to `shared/contracts.ts`:

```ts
export const FixEntry = z.object({
  id: z.string(),
  file: z.string(),
  displayFile: z.string(),
  line: z.number().nullable(),
  badSymbol: z.string(),
  candidates: z.array(z.string()),
  createdAt: z.string(),
});
export type FixEntry = z.infer<typeof FixEntry>;

export const ProjectTrust = z.object({
  projectId: z.string(),
  repo: z.string(),
  branch: z.string().nullable(),
  localPath: z.string().nullable(),
  score: z.number().nullable(),
  label: z.string().nullable(),
  indexFresh: z.boolean(),
  entityCount: z.number().nullable(),
  fixes: z.array(FixEntry),
});
export type ProjectTrust = z.infer<typeof ProjectTrust>;

export const CodeTrustResponse = z.object({
  available: z.boolean(),
  projects: z.array(ProjectTrust),
});
export type CodeTrustResponse = z.infer<typeof CodeTrustResponse>;

export const CodeTrustAction = z.object({
  projectId: z.string(),
  id: z.string(),
  action: z.enum(["apply", "reject"]),
  pick: z.number().optional(),
});
export type CodeTrustAction = z.infer<typeof CodeTrustAction>;

export const CodeTrustActionResponse = z.object({
  status: z.enum(["applied", "stale", "rejected", "not-found", "error"]),
  message: z.string(),
  data: CodeTrustResponse,
});
export type CodeTrustActionResponse = z.infer<typeof CodeTrustActionResponse>;
```

- [ ] **Step 2: Write the failing test.** Create `backend/src/tests/cleanTrust.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { makeFakeCleanDir } from "./setup.ts";

const CLEAN = makeFakeCleanDir();
process.env.CCP_CLEAN_DIR = CLEAN;

const { getCodeTrust } = await import("../api/clean-trust.ts");

describe("getCodeTrust", () => {
  it("is available and lists projects sorted by pending-fix count desc", () => {
    const res = getCodeTrust();
    expect(res.available).toBe(true);
    expect(res.projects[0]!.projectId).toBe("owner--repo--main"); // 2 fixes first
    expect(res.projects[0]!.fixes.length).toBe(2);
    expect(res.projects[1]!.fixes.length).toBe(0);
  });

  it("joins metadata + score + maps fix fields", () => {
    const p = getCodeTrust().projects.find((x) => x.projectId === "owner--repo--main")!;
    expect(p.repo).toBe("owner/repo");
    expect(p.localPath).toBe("/repo");
    expect(p.score).toBe(73);
    expect(p.label).toBe("REVIEW");
    expect(p.indexFresh).toBe(true);
    expect(p.entityCount).toBe(1115);
    expect(p.fixes[0]!.badSymbol).toBe("load_indx");
    expect(p.fixes[0]!.file).toBe("/repo/svc.py");
    expect(p.fixes[0]!.displayFile).toBe("svc.py");
  });
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `cd backend && bun test src/tests/cleanTrust.test.ts`
Expected: FAIL — `Cannot find module '../api/clean-trust.ts'`.

- [ ] **Step 4: Implement the aggregator.** Create `backend/src/api/clean-trust.ts`:

```ts
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
  type FixEntry,
  type ProjectTrust,
} from "../../../shared/contracts.ts";

function toFixEntry(f: RawFix): FixEntry {
  return {
    id: f.id,
    file: f.file_path,
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
```

- [ ] **Step 5: Run test to verify it passes.**

Run: `cd backend && bun test src/tests/cleanTrust.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit.**

```bash
git add shared/contracts.ts backend/src/api/clean-trust.ts backend/src/tests/cleanTrust.test.ts
git commit -m "feat(code-trust): contracts + getCodeTrust aggregator"
```

---

## Task B3: Apply/Reject action (CLI-backed)

**Files:**
- Create: `backend/src/lib/cleanFixes.ts`
- Modify: `backend/src/api/clean-trust.ts`
- Create: `backend/src/tests/cleanTrustAction.test.ts`

- [ ] **Step 1: Write the failing test.** Create `backend/src/tests/cleanTrustAction.test.ts`. It injects a fake runner so no real CLI is needed:

```ts
import { describe, expect, it } from "bun:test";
import { makeFakeCleanDir } from "./setup.ts";

const CLEAN = makeFakeCleanDir();
process.env.CCP_CLEAN_DIR = CLEAN;

const { codeTrustAction } = await import("../api/clean-trust.ts");

function fakeRunner(out: string) {
  const calls: { args: string[]; cwd: string }[] = [];
  const run = async (args: string[], cwd: string) => {
    calls.push({ args, cwd });
    return { ok: true, stdout: out, stderr: "" };
  };
  return { run, calls };
}

describe("codeTrustAction", () => {
  it("runs clean-fixes apply in the project's local_path and maps 'Applied'", async () => {
    const r = fakeRunner("Applied a1: load_indx → load_index\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "a1", action: "apply" },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["apply", "a1"]);
    expect(r.calls[0]!.cwd).toBe("/repo");
    expect(res.status).toBe("applied");
    expect(res.data.available).toBe(true);
  });

  it("passes --pick and maps a stale result", async () => {
    const r = fakeRunner("Skipped a1 (stale: the symbol is gone ...)\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "a1", action: "apply", pick: 1 },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["apply", "a1", "--pick", "1"]);
    expect(res.status).toBe("stale");
  });

  it("maps reject", async () => {
    const r = fakeRunner("Rejected b2.\n");
    const res = await codeTrustAction(
      { projectId: "owner--repo--main", id: "b2", action: "reject" },
      r.run,
    );
    expect(r.calls[0]!.args).toEqual(["reject", "b2"]);
    expect(res.status).toBe("rejected");
  });

  it("errors for an unknown project (no local_path)", async () => {
    const r = fakeRunner("");
    const res = await codeTrustAction(
      { projectId: "ghost", id: "x", action: "apply" },
      r.run,
    );
    expect(res.status).toBe("error");
    expect(r.calls.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `cd backend && bun test src/tests/cleanTrustAction.test.ts`
Expected: FAIL — `codeTrustAction` is not exported.

- [ ] **Step 3: Implement the runner + action.** Create `backend/src/lib/cleanFixes.ts`:

```ts
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
```

In `backend/src/api/clean-trust.ts`, add the **new** imports (note: `readProjects` and `METADATA_DB` are already imported from Task B2 — do not duplicate them; only add the runner + the action contracts), then the action (the `run` param defaults to the real runner; tests inject a fake):

```ts
import { runCleanFixes, type CleanFixesRunner } from "../lib/cleanFixes.ts";
import {
  CodeTrustAction,
  CodeTrustActionResponse,
  type CodeTrustActionResponse as ActionRes,
} from "../../../shared/contracts.ts";
```

(Merge the `CodeTrustAction`/`CodeTrustActionResponse` names into the existing
`from "../../../shared/contracts.ts"` import rather than adding a second import line.)

function classify(stdout: string): ActionRes["status"] {
  const s = stdout.toLowerCase();
  if (s.startsWith("applied")) return "applied";
  if (s.includes("stale") || s.startsWith("skipped")) return "stale";
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
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `cd backend && bun test src/tests/cleanTrustAction.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add backend/src/lib/cleanFixes.ts backend/src/api/clean-trust.ts backend/src/tests/cleanTrustAction.test.ts
git commit -m "feat(code-trust): apply/reject via clean-fixes CLI"
```

---

## Task B4: Wire the routes into the server

**Files:**
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Register the routes.** In `backend/src/server.ts`:

Add the import near the other api imports:
```ts
import { getCodeTrust, codeTrustAction } from "./api/clean-trust.ts";
```

Add to the `GET_ROUTES` record (alongside the others):
```ts
  "/api/code-trust": async () => getCodeTrust(),
```

Add a POST handler alongside the existing `if (req.method === "POST" && pathname === ...)` blocks:
```ts
    if (req.method === "POST" && pathname === "/api/code-trust/action") {
      const body = await req.json();
      return json(await codeTrustAction(body));
    }
```

- [ ] **Step 2: Verify the server still typechecks and boots.**

Run: `cd backend && bunx tsc --noEmit && bun -e "import('./src/api/clean-trust.ts').then(()=>console.log('ok'))"`
Expected: prints `ok`, no type errors. (Full suite next.)

- [ ] **Step 3: Run the full backend test suite.**

Run: `cd backend && bun test`
Expected: all pass (existing + the 3 new files).

- [ ] **Step 4: Commit.**

```bash
git add backend/src/server.ts
git commit -m "feat(code-trust): register /api/code-trust routes"
```

---

## Task B5: Frontend plumbing (client, nav, app shell, count badge)

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/nav.ts`, `frontend/src/components/icons.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/useCounts.ts`

> No frontend test runner exists; verify with `tsc -b`. `CodeTrustView` is created in B6 — to keep this task typechecking on its own, B5 adds a minimal placeholder view that B6 replaces.

- [ ] **Step 1: Add client methods.** In `frontend/src/api/client.ts`, add the type imports to the existing `import type { ... } from "@shared/contracts"` block: `CodeTrustResponse, CodeTrustAction, CodeTrustActionResponse`. Then add to the `api` object:

```ts
  getCodeTrust: (): Promise<CodeTrustResponse> =>
    request<CodeTrustResponse>("/api/code-trust"),

  codeTrustAction: (req: CodeTrustAction): Promise<CodeTrustActionResponse> =>
    bust(
      request<CodeTrustActionResponse>("/api/code-trust/action", {
        method: "POST",
        body: JSON.stringify(req),
      }),
      () => [api.getCodeTrust],
    ),
```

- [ ] **Step 2: Add the nav surface + item + icon.** In `frontend/src/nav.ts`: add `"code-trust"` to the `SurfaceId` union; import `CodeTrustIcon` from `@/components/icons`; add to `NAV_ITEMS` (place it after `gbrain` or wherever fits):

```ts
  { id: "code-trust", label: "Code Trust", hint: "AI-code fixes", icon: CodeTrustIcon },
```

In `frontend/src/components/icons.tsx`, add a `CodeTrustIcon` matching the existing icon component signature (`(props: SVGProps<SVGSVGElement>) => JSX.Element`). Use a simple shield-check glyph:

```tsx
export const CodeTrustIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
```

- [ ] **Step 3: Add a placeholder view + wire the app shell.** Create `frontend/src/views/CodeTrustView.tsx` (placeholder, replaced in B6):

```tsx
export function CodeTrustView() {
  return <div className="text-fog-400">Code Trust — coming up.</div>;
}
```

In `frontend/src/App.tsx`: import it (`import { CodeTrustView } from "@/views/CodeTrustView";`), add `"code-trust": CodeTrustView,` to `VIEWS`, and add to `SUBTITLES`:
```ts
  "code-trust": "Trust-HUD fixes for AI-written code, by project. Review and apply.",
```

- [ ] **Step 4: Add the count badge.** In `frontend/src/lib/useCounts.ts`, add another `track(...)` to the `unsubs` array:

```ts
      track(
        "code-trust",
        api.getCodeTrust,
        (d) => d.projects.reduce((n, p) => n + p.fixes.length, 0),
      ),
```

- [ ] **Step 5: Verify typecheck.**

Run: `cd frontend && tsc -b`
Expected: no type errors.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/api/client.ts frontend/src/nav.ts frontend/src/components/icons.tsx frontend/src/App.tsx frontend/src/lib/useCounts.ts frontend/src/views/CodeTrustView.tsx
git commit -m "feat(code-trust): frontend plumbing (client, nav, count badge)"
```

---

## Task B6: The CodeTrustView (two-pane inbox + actions)

**Files:**
- Modify: `frontend/src/views/CodeTrustView.tsx`

> Match the existing view conventions — study `frontend/src/views/McpView.tsx` for the `useAsync`/`useToast`/`Button`/`ScrollArea`/`ViewState` usage and the Tailwind class vocabulary (`bg-ink-*`, `text-fog-*`, `border-ink-700`). No test runner: verify with `tsc -b` + a manual smoke test.

- [ ] **Step 1: Implement the view.** Replace `frontend/src/views/CodeTrustView.tsx` with:

```tsx
import { useState } from "react";
import type { ProjectTrust, FixEntry } from "@shared/contracts";
import { api } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ErrorState, EmptyState } from "@/components/ViewState";
import { Spinner } from "@/components/ui/Spinner";

const TONE: Record<string, string> = {
  OK: "text-emerald-400",
  REVIEW: "text-amber-400",
  RISK: "text-red-400",
};

export function CodeTrustView() {
  const { data, loading, error, reload, setData } = useAsync(api.getCodeTrust);
  const [selected, setSelected] = useState<{ pid: string; id: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data?.available)
    return <EmptyState title="Trust-HUD not set up" message="No ~/.clean data found." />;

  const projects = data.projects;
  const totalFixes = projects.reduce((n, p) => n + p.fixes.length, 0);
  const current = selected
    ? projects.find((p) => p.projectId === selected.pid)?.fixes.find((f) => f.id === selected.id)
    : undefined;
  const currentProject = selected
    ? projects.find((p) => p.projectId === selected.pid)
    : undefined;

  async function act(action: "apply" | "reject") {
    if (!selected || !currentProject) return;
    setBusy(true);
    try {
      const res = await api.codeTrustAction({
        projectId: selected.pid,
        id: selected.id,
        action,
        pick: action === "apply" ? pick : undefined,
      });
      setData(res.data);
      setSelected(null);
      setPick(0);
      toast.show(res.message || res.status, res.status === "applied" || res.status === "rejected" ? "success" : "warn");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* list pane */}
      <ScrollArea className="w-80 shrink-0 pr-2">
        <div className="mb-2 text-2xs uppercase tracking-widest text-fog-500">
          Pending fixes · {totalFixes}
        </div>
        {totalFixes === 0 && (
          <EmptyState title="All clear" message="No pending fixes across your indexed repos." />
        )}
        {projects.map((p: ProjectTrust) => (
          <div key={p.projectId} className="mb-4">
            <div className="flex items-center justify-between px-1 py-1 text-sm">
              <span className="truncate text-fog-200">{p.repo}</span>
              {p.score != null && (
                <span className={`text-2xs ${TONE[p.label ?? ""] ?? "text-fog-400"}`}>
                  {p.label} {p.score}{p.indexFresh ? "" : " · stale"}
                </span>
              )}
            </div>
            {p.fixes.length === 0 ? (
              <div className="px-1 text-2xs text-fog-600">— no pending fixes —</div>
            ) : (
              p.fixes.map((f: FixEntry) => {
                const on = selected?.pid === p.projectId && selected.id === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setSelected({ pid: p.projectId, id: f.id }); setPick(0); }}
                    className={`mb-1.5 block w-full rounded-lg border px-3 py-2 text-left font-mono text-xs ${
                      on ? "border-accent-500 bg-accent-500/10" : "border-ink-700 hover:border-ink-600"
                    }`}
                  >
                    <div className="text-fog-400">{f.displayFile}:{f.line ?? "?"}</div>
                    <div className="text-red-400">{f.badSymbol}</div>
                    <div className="text-emerald-400">→ {f.candidates[0]}</div>
                  </button>
                );
              })
            )}
          </div>
        ))}
      </ScrollArea>

      {/* detail pane */}
      <div className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900/50 p-5">
        {!current ? (
          <div className="text-fog-500">Select a fix to review.</div>
        ) : (
          <div className="font-mono text-sm">
            <div className="mb-3 text-fog-400">{current.file} · line {current.line ?? "?"}</div>
            <div className="mb-2 text-2xs uppercase tracking-widest text-fog-500">Likely hallucinated call</div>
            <div className="rounded-md border border-ink-700 bg-ink-950 p-3">
              <div className="text-red-400">- {current.badSymbol}</div>
              <div className="text-emerald-400">+ {current.candidates[pick]}</div>
            </div>
            {current.candidates.length > 1 && (
              <div className="mt-3 text-xs text-fog-400">
                Candidate:&nbsp;
                {current.candidates.map((c, i) => (
                  <button key={c} onClick={() => setPick(i)}
                    className={`mr-2 rounded px-2 py-0.5 ${i === pick ? "bg-accent-500/20 text-accent-300" : "text-fog-400 hover:text-fog-200"}`}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button disabled={busy} onClick={() => act("apply")}>Apply</Button>
              <Button variant="ghost" disabled={busy} onClick={() => act("reject")}>Reject</Button>
            </div>
            <div className="mt-3 text-2xs text-fog-600">
              Safe: applies only if the symbol occurs exactly once in the file, else marked stale.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reconcile with real component APIs.** The exact prop names of `Button` (`variant`), `EmptyState`/`ErrorState`, `ScrollArea`, `useToast().show(msg, tone)`, and the accent color classes may differ — open `frontend/src/views/McpView.tsx` and `frontend/src/components/ui/*` and adjust the imports/props/classes above to match the real signatures. Do not invent props; use what exists.

- [ ] **Step 3: Verify typecheck.**

Run: `cd frontend && tsc -b`
Expected: no type errors.

- [ ] **Step 4: Manual smoke test.** Build + run the panel and exercise it against real data:

```bash
# ensure a real fix exists (from the clean-mcp repo) so the tab has content:
#   cd ~/clean-mcp-trust-hud && printf 'def r():\n    return load_indx()\n' > src/clean/_smoke.py
#   .venv/bin/python -c "from clean.services.container import ServiceContainer as S; S().indexer.index('.')" ; .venv/bin/clean-score src/clean/_smoke.py
cd ~/claude-control-panel && bash scripts/launch.sh
```
Expected: the panel opens; "Code Trust" appears in the nav with a pending-fix badge; the repo lists its fixes; selecting one shows the diff; **Apply** rewrites the file and the fix disappears; **Reject** removes it. (Clean up `_smoke.py` after.)

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/views/CodeTrustView.tsx
git commit -m "feat(code-trust): two-pane fix inbox view with apply/reject"
```

---

## Phase C — Task C1: Live inbox (polling)

**Files:**
- Modify: `frontend/src/views/CodeTrustView.tsx`

> Begin this task automatically once Phase B is verified working (tests green + the manual smoke test passes). No checkpoint.

- [ ] **Step 1: Add interval polling + a live indicator.** In `CodeTrustView`, after the existing `useAsync` line, add a poll that refreshes the data every 3s without flashing the spinner (don't disturb the in-progress selection):

```tsx
import { useEffect } from "react";
// ...
  useEffect(() => {
    const t = setInterval(() => { if (!busy) void api.getCodeTrust().then(setData).catch(() => {}); }, 3000);
    return () => clearInterval(t);
  }, [busy, setData]);
```

Add a small live indicator near the "Pending fixes · N" header:
```tsx
  <span className="ml-2 text-2xs text-emerald-400">● live</span>
```

- [ ] **Step 2: Verify typecheck.**

Run: `cd frontend && tsc -b`
Expected: no type errors.

- [ ] **Step 3: Manual smoke test (liveness).** With the panel open on the Code Trust tab, trigger a new fix in `~/clean-mcp-trust-hud` (edit a file with a near-miss call + `clean-score` it) and confirm the inbox updates within ~3s without a manual refresh. Clean up after.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/views/CodeTrustView.tsx
git commit -m "feat(code-trust): live inbox polling"
```

---

## Self-review notes

- **Frontend has no unit-test runner** (only `tsc -b`) — frontend tasks verify via typecheck + manual smoke, not TDD. Backend tasks are full TDD with `bun test`. This matches the codebase; don't add a frontend test framework.
- `CodeTrustView`'s exact component/prop usage (Button/ScrollArea/ViewState/Toast/accent classes) is reconciled against the real `components/ui/*` in B6 Step 2 — the code shown is the structure, not a guarantee of prop names.
- Apply correctness is **not** re-implemented here — it stays in `clean-fixes` (atomic + unique-occurrence). The panel only orchestrates and surfaces the result.
- Known v1 scope: a fixes file for a project absent from `metadata.db` won't be applyable (no `local_path`) — it just won't appear (we iterate metadata projects). Acceptable; surface later if needed.
