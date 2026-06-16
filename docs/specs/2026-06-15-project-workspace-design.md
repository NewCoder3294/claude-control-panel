# Project Workspace — Design

**Date:** 2026-06-15
**Status:** Approved (execute end-to-end)
**Surface:** New `PROJECT` sidebar group in the Claude Code Control Panel.

## Goal

Let the user manage **project-scoped** Claude Code configuration — the same kinds of
config the panel already manages globally (CLAUDE.md, memory, settings, commands,
agents, rules, MCP), but for a single project. A project switcher in the sidebar
re-scopes a dedicated set of surfaces to the selected project.

## Decisions (from brainstorming)

- **UX model:** a parallel `PROJECT` nav group with a project switcher at its header,
  sitting alongside the existing global groups. Global vs project is always visible.
- **Surfaces:** all of them — Instructions (CLAUDE.md), Memory, Settings, Commands,
  Agents, Rules, MCP — plus a small **Overview**.
- **Discovery:** auto-discover from Claude Code's own registry. No manual add.
- **Scope:** full CRUD now (create / rename / delete), not edit-only.
- **Empty state:** offer to create missing fixed files (settings.json, .mcp.json,
  CLAUDE.md) on the spot with a sensible template.

## Key insight

Every project surface is just **a set of editable files** backed by a directory or a
fixed path. So the feature is a thin orchestration over the panel's existing building
blocks (`MasterDetail`, `FileEditor`, backups, path guard) — not a stack of bespoke
per-surface UIs.

## Discovery (verified empirically 2026-06-15)

- **Authoritative project list:** keys of the `projects` map in `~/.claude.json` are
  exact absolute project paths (23 entries; 11 still exist on disk).
- **Filter:** keep entries that exist on disk and are not `$HOME` (which is "Global").
- **Slug:** `path.replace(/[^a-zA-Z0-9]/g, "-")`. Verified: every existing project's
  slug matches its registry dir under `~/.claude/projects/<slug>/`. This is where the
  project's memory (`memory/`) and session transcripts (`*.jsonl`) live.
- **Per-project surfaces** (all optional, often sparse — hence create-on-the-spot):
  - Instructions: `<root>/CLAUDE.md` and `<root>/.claude/CLAUDE.md`
  - Settings: `<root>/.claude/settings.json`, `<root>/.claude/settings.local.json`
  - Commands: `<root>/.claude/commands/*.md`
  - Agents: `<root>/.claude/agents/*.md`
  - Rules: `<root>/.claude/rules/*.md`
  - MCP: `<root>/.mcp.json`
  - Memory: `~/.claude/projects/<slug>/memory/*.md`

## Backend

### `lib/projects.ts` (new)
- `slugForPath(path)` — the verified transform.
- `discoverProjects()` → `ProjectInfo[]` `{ path, name, slug, root, claudeDir, memoryDir }`
  from `~/.claude.json`, filtered to existing non-HOME dirs, sorted by most-recent
  session activity.
- `isProjectScopedPath(resolved)` — true iff `resolved` is inside a known project's
  writable roots: `<root>/.claude/**`, `<root>/CLAUDE.md`, `<root>/.mcp.json`, or its
  `memoryDir/**`. The security boundary that widens writes beyond `~/.claude`.

### `api/projects.ts` (new)
- `listProjects()` → `ProjectsResponse` — summaries with `configKinds`, `sessionCount`,
  `lastActive`.
- `projectDetail(slug)` → `ProjectDetail` — resolve slug through `discoverProjects()`
  (never trust a client path), then gather `ProjectFileGroup[]`. Fixed-file surfaces
  (instructions/settings/mcp) include missing files as `exists:false` ConfigFiles with
  a template in `content`, so the UI can offer "create". Named surfaces
  (commands/agents/rules/memory) list existing `.md` files.
- `projectFileCreate({slug, surface, name})` — resolve the target dir server-side from
  (slug, surface); create `<dir>/<name>.md` (named) or the fixed file with its template.
- `projectFileRename({path, newName})` / `projectFileDelete({path})` — reuse the generic
  rename/delete, guarded by `isProjectScopedPath`. Deletes go to the reversible trash.

### Guard changes (`file.ts`, minimal + additive)
- `assertWritable`: also allow `isProjectScopedPath(resolved)`.
- JSON validation: validate any permitted `.json` write (so a malformed project
  `.mcp.json`/`settings.json` is rejected before overwrite), not only those under
  `~/.claude`.
- Backups still wrap every write; nothing else changes.

### Contracts (`shared/contracts.ts`)
`ProjectSummary`, `ProjectsResponse`, `ProjectSurfaceId`, `ProjectFileGroup`,
`ProjectDetail`, `ProjectFileCreateRequest`. Reuse the existing `ConfigFile`,
`FsRenameRequest`, `FsDeleteRequest`, `OkResponse`.

### Routes (`server.ts`)
`GET /api/projects`, `GET /api/projects/detail?slug=…`,
`POST /api/projects/file/create|rename|delete`.

## Frontend

### Nav / routing (`App.tsx`, `nav.ts`)
Introduce a `Route` union: `{kind:"global", surface}` | `{kind:"project", slug, surface}`.
Global routing is unchanged. `nav.ts` gains `PROJECT_SURFACES` (id, label, icon).

### Sidebar (`Sidebar.tsx`)
A new `PROJECT` group whose header is a switcher (`<select>` of discovered projects).
Selecting a project sets the route and persists the slug to localStorage. Beneath the
switcher: Overview + one item per project surface. Reuses the new collapse behavior.

### `ProjectView.tsx` (new)
Loads `projectDetail(slug)`. Renders the active surface:
- **Overview:** path, slug, session count/last active, and which configs exist with
  jump links.
- **A file surface:** the group's files in `MasterDetail` + `FileEditor`, with
  create/rename/delete wired to the project endpoints. Missing fixed files appear in
  the list and open with their template; a single **Create** action writes them.

### `FileEditor.tsx` (additive)
When `!file.exists` and editable, allow saving the current buffer to **create** the
file (button label "Create"; enabled even when not dirty). Existing flows always pass
existing files, so behavior there is unchanged.

To avoid any risk to the three shipped global surfaces that use `FsListView`, the
project file management is a dedicated `ProjectView` that reuses the lower-level shared
pieces (`MasterDetail`, `FileEditor`, `Modal`, `Button`) rather than modifying
`FsListView`.

## Testing

`backend/src/tests/projects.test.ts` against a temp `CCP_CLAUDE_DIR` + a temp project
root + a temp `~/.claude.json`:
- `slugForPath` transform.
- discovery: filters non-existent and HOME; computes slug/memoryDir.
- `isProjectScopedPath`: allows `<root>/.claude/x`, `<root>/CLAUDE.md`,
  `<root>/.mcp.json`, `memoryDir/x`; rejects an arbitrary outside path and a sibling
  dir not registered as a project.
- detail gathering: fixed files present as `exists:false` with templates; named files
  listed.
- create resolves the right dir; rename/delete stay reversible.

## Out of scope (this build)
- Editing project MCP via a structured form (raw `.mcp.json` editing only).
- Project skills (skills are global in Claude Code).
- A rich frontmatter editor for project agents (raw `.md` editing, like the file editor).
