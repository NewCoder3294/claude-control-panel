# Claude Code Control Panel — Design Spec

**Date:** 2026-06-14
**Status:** Approved → in build
**Owner:** Nicolas

## Purpose

A local web app, launched by a slash command (`/panel`), that visualizes and
manages **everything Claude Code reads** at session start: global & project
`CLAUDE.md`, rules, memory, MCP servers, skills, slash commands, and settings.

v1 goal: **visualize + safe edits.** Browse every config surface, edit
`CLAUDE.md` and memory inline (with automatic backups), and enable/disable or
archive skills & MCP servers. No risky bulk operations.

## Non-goals (v1)

- No bulk skill pruning / mass delete.
- No editing of claude.ai-scoped MCP connectors (proven unmanageable locally —
  shown read-only with a "disconnect in claude.ai app" note).
- No remote access — binds to `127.0.0.1` only.
- No auth (local single-user tool).

## Architecture

```
~/claude-control-panel/
  backend/    Bun server: REST API over ~/.claude + serves built UI (port 4317)
  frontend/   Vite + React + Tailwind SPA (shadcn-style components)
  shared/     contracts.ts — zod schemas + TS types shared FE <-> BE
  scripts/    launch.sh — build if needed, boot server, open browser
  docs/       this spec + docs.md per dir
```

Data flow: SPA fetches `/api/*` → backend reads `~/.claude` files / shells
`claude mcp list` → returns JSON validated against `shared/contracts.ts`.
Edits: SPA `PUT /api/file` → backend backs up then writes → returns new state.

### Boundaries (each unit testable in isolation)

- **backend/lib** — pure I/O: `fsutil` (safe read/list), `backup` (timestamped
  copies), `mcpCli` (shell + parse `claude mcp list`). No HTTP knowledge.
- **backend/api/*** — one module per surface, each a `(req) => Response`-ish
  handler that calls lib + returns contract-shaped JSON.
- **backend/src/server.ts** — routing + static serving only.
- **frontend/views/*** — one component per surface, pure rendering against the
  typed api client. No cross-view state.
- **shared/contracts.ts** — single source of truth for every payload shape.

## Config surfaces (the "everything Claude reads" map)

| Surface | Source | API | Edit? |
|---|---|---|---|
| Instructions | `~/.claude/CLAUDE.md`, project `CLAUDE.md`s, `~/.claude/rules/*` | `/api/instructions` | yes (file) |
| Memory | `~/.claude/projects/.../memory/MEMORY.md` + files | `/api/memory` | yes (file) |
| MCP | `claude mcp list` + `~/.claude.json` | `/api/mcp` | toggle (user scope only) |
| Skills | `~/.claude/skills/*`, archive dir | `/api/skills` | archive/restore |
| Commands | `~/.claude/commands/*` | `/api/commands` | yes (file) |
| Settings | `~/.claude/settings.json`, `settings.local.json` | `/api/settings` | yes (validated JSON) |
| Context Map | aggregate of the above | `/api/context-map` | read-only |

## Safety

- Every write → timestamped backup in `~/.claude/.control-panel-backups/<ts>/`
  before overwriting.
- `settings.json` writes must `JSON.parse` successfully or are rejected (400).
- Path traversal guard: writable paths must resolve under `~/.claude` (or known
  project dirs). Anything else → 403.
- Skill/MCP archive = reversible move, never delete.
- Server binds `127.0.0.1` only.

## Launch

`/panel` slash command → runs `scripts/launch.sh`:
1. `bun install` if needed; build frontend if `frontend/dist` missing/stale.
2. Boot Bun server on `127.0.0.1:4317` (serves API + dist).
3. Open default browser to `http://127.0.0.1:4317`.

## Tech

- Backend: **Bun** (native TS, fast cold start), `bun test`.
- Frontend: **Vite + React + TypeScript + Tailwind**, hand-rolled shadcn-style
  primitives (Button/Card/Tabs), **CodeMirror** (`@uiw/react-codemirror`) editor.
- Validation: **zod** schemas in `shared/contracts.ts` (shared FE/BE).
- Port: `4317`.

## Testing

- Backend: `bun test` over lib + api (mock a temp `.claude` dir via env override
  `CCP_CLAUDE_DIR`). Cover backup creation, path-traversal rejection, settings
  JSON validation, mcp parse, skills archive/restore.
- Smoke: boot server, `curl` each endpoint, confirm SPA serves.
