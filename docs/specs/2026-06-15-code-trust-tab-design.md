# Code Trust Tab — Control Panel ↔ Trust-HUD integration

- **Date:** 2026-06-15
- **Status:** Draft for review
- **Project:** `claude-control-panel` (the feature lives here; `clean-mcp-trust-hud` is an unchanged data source)
- **Builds on:** the Trust-HUD self-healing fix inbox (`~/.clean/fixes/`, `clean-fixes` CLI)

## Context

The Control Panel already visualizes and manages everything Claude Code reads under
`~/.claude` (instructions, memory, MCP, skills, settings, …) via a Bun REST API + React
frontend. The Trust-HUD (`clean-mcp-trust-hud`) writes its state to `~/.clean/`: a
per-repo **fix inbox** of high-confidence hallucinated-symbol corrections, a per-repo
**trust score**, and an **index metadata** DB. Today those fixes are reviewed only via the
`clean-fixes` terminal CLI.

This adds a **"Code Trust"** tab to the Control Panel: a project-grouped, actionable view
of the fix inbox (review + Apply/Reject from the browser) with a per-project trust header.
It's a natural fit — the panel already reads local config files; `~/.clean/` is just more
local files, and apply/reject reuses the panel's established **CLI-backed route** pattern.

## Goals

- **Phase B — Actionable inbox** (first): a new "Code Trust" nav tab showing, per project,
  the TRUST score + index freshness and the list of pending fixes; selecting a fix shows a
  diff and **Apply / Reject** (+ alternate candidate) buttons that act through `clean-fixes`.
  Loads on open with a manual **Refresh**.
- **Phase C — Live** (immediately after B is verified working): the view polls the same
  endpoint on an interval so the inbox updates as you code. No backend changes.

Phase C follows B **autonomously** — once B is confirmed 100% working (tests green +
verified against a real `~/.clean/fixes`), proceed to C without a checkpoint.

## Non-Goals

- No changes to `clean-mcp-trust-hud`. The panel only *reads* `~/.clean/` files and *calls*
  the existing `clean-fixes` CLI.
- No reimplementation of the safe apply logic in TypeScript (clean's atomic, unique-occurrence
  apply stays the single source of truth).
- No websockets/SSE. Phase C is frontend polling of the existing GET endpoint.
- No editing of trust scores or re-indexing from the panel (read-only for those; the header
  is informational). Triggering a reindex could be a later addition.

## Architecture

### Data sources (all under `~/.clean/`)

- `fixes/<project_id>.json` — the per-repo inbox: a list of
  `{ id, file_path, line, bad_symbol, candidates, created_at }`. Filenames are the raw
  `project_id` (its characters are already filename-safe).
- `scoring/<project_id>.json` — the per-repo last-good score: `{ overall_score,
  overall_label, stale, indexed, indicators, … }`.
- `metadata.db` (SQLite) — table `projects`: `project_id, repo_full_name, branch,
  local_path, status, entity_count, last_indexed_at`. Read with Bun's built-in `bun:sqlite`
  (no new dependency). Provides display names + the `local_path` needed to run `clean-fixes`.

### Backend (Bun/TS)

- `config.ts`: add `CLEAN_DIR = process.env.CCP_CLEAN_DIR || join(HOME, ".clean")` and
  `CLEAN_FIXES_BIN = process.env.CCP_CLEAN_FIXES_BIN || join(HOME, "clean-mcp-trust-hud/.venv/bin/clean-fixes")`,
  mirroring the existing env-override style.
- `api/clean-trust.ts` (new module):
  - `getCodeTrust(): CodeTrustResponse` — list `fixes/*.json`, read each inbox; load the
    `projects` map from `metadata.db`; for each project that is indexed *or* has fixes,
    attach `scoring/<id>.json` (trust score/label/stale) and metadata (repo, branch,
    `local_path`, `entityCount`). Returns projects sorted by pending-fix count desc. Missing
    `~/.clean` → `{ projects: [], available: false }` (panel shows a "not set up" state).
    Best-effort: a malformed file is skipped, never throws.
  - `codeTrustAction(body): ActionResult` — validate `{ projectId, id, action, pick? }`;
    look up the project's `local_path`; spawn `CLEAN_FIXES_BIN <action> <id> [--pick N]`
    with `cwd = local_path` (Bun `spawn`), capture stdout, map it to a status
    (`applied | stale | rejected | not-found`); return the status + the refreshed
    `getCodeTrust()` payload. Unknown project / missing binary → a typed error, not a crash.
- `server.ts`: register `GET /api/code-trust` in `GET_ROUTES`, and a
  `POST /api/code-trust/action` route alongside the existing POST handlers.

### Shared contracts (`shared/contracts.ts`)

```ts
export const FixEntry = z.object({
  id: z.string(), file: z.string(), displayFile: z.string(),
  line: z.number().nullable(), badSymbol: z.string(),
  candidates: z.array(z.string()), createdAt: z.string(),
});
export const ProjectTrust = z.object({
  projectId: z.string(), repo: z.string(), branch: z.string().nullable(),
  localPath: z.string(),
  score: z.number().nullable(), label: z.string().nullable(),
  indexFresh: z.boolean(), entityCount: z.number().nullable(),
  fixes: z.array(FixEntry),
});
export const CodeTrustResponse = z.object({
  available: z.boolean(), projects: z.array(ProjectTrust),
});
export const CodeTrustAction = z.object({
  projectId: z.string(), id: z.string(),
  action: z.enum(["apply", "reject"]), pick: z.number().optional(),
});
```

### Frontend (Vite/React)

- `views/CodeTrustView.tsx` — two-pane: left = projects (trust header per project + their
  pending fixes), right = selected fix detail (a red/green diff of `bad_symbol →
  candidate[pick]`, alternate candidates, **Apply / Reject** buttons + a candidate picker,
  and the safety note). Empty state when `available` is false or no fixes.
- `lib/navigation.tsx` — add the "Code Trust" nav entry; `lib/useCounts.ts` — surface the
  total pending-fix count as the nav badge.
- `api/client.ts` — `getCodeTrust()` and `codeTrustAction()` calls.
- **Phase C:** `CodeTrustView` adds a `setInterval` (~3s, cleared on unmount) re-fetching
  `getCodeTrust()`; a small "live ●" indicator. That is the entire delta from B.

### Apply mechanism (confirmed)

Apply/Reject **shell out to `clean-fixes`** run with `cwd` set to the project's
`local_path`. This keeps clean's safe atomic apply (temp-file + `os.replace` +
unique-occurrence guard) as the single source of truth and matches the panel's existing
`mcp`/`gbrain` CLI-backed routes. Before an apply, the panel's existing
backup-before-edit can snapshot the target file for an extra undo net.

## Error handling & safety

- Binds 127.0.0.1 only (inherited from the panel).
- All reads best-effort: missing/!`~/.clean`, malformed JSON, or absent `metadata.db` →
  graceful empty/partial response, never a 500.
- Apply correctness is owned by `clean-fixes` (atomic, refuses ambiguous/zero matches →
  reports "stale"); the panel surfaces that status verbatim.
- The `clean-fixes` binary path is configurable; if it's missing, the action route returns a
  clear "Trust-HUD CLI not found — set CCP_CLEAN_FIXES_BIN" message rather than failing
  silently.

## Testing

- **Backend (`bun test`):** point `CCP_CLEAN_DIR` at a temp dir with fixture
  `fixes/*.json` + `scoring/*.json` + a temp `metadata.db`; assert `getCodeTrust()`
  aggregates/join/sorts correctly, handles missing dir, and skips malformed files. For
  `codeTrustAction`, assert the spawned command + args + `cwd` are built correctly (inject a
  fake spawn) and that stdout maps to the right status.
- **Frontend:** render `CodeTrustView` against a mocked client for the key states (loading,
  empty/not-available, projects with fixes, an apply success and a stale result). Follow the
  panel's existing view-test conventions.

## Phasing

1. **Phase B** — config + `api/clean-trust.ts` (GET + action) + contracts + `CodeTrustView`
   + nav/count + tests. Verify against a real `~/.clean/fixes` end to end.
2. **Phase C** — add interval polling + live indicator to `CodeTrustView` (+ a test). Begun
   automatically once B is verified.

## Resolved decisions

- **Depth:** C is the target; build **B first, then C**, transitioning autonomously once B
  is verified (no checkpoint). 2026-06-15.
- **Tab content:** fuller — per-project **TRUST header** (score + index freshness) above the
  **project-grouped fix inbox**. 2026-06-15.
- **Apply mechanism:** **shell out to `clean-fixes`** (cwd = project `local_path`); do not
  reimplement apply in TS. 2026-06-15.
- **Liveness:** frontend polling (~3s), no backend SSE. 2026-06-15.
