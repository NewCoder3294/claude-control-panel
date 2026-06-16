# Claude Code Control Panel

A local web app that visualizes and manages **everything Claude Code reads** —
global & project `CLAUDE.md`, rules, memory, MCP servers, skills, slash commands,
and settings. Launch it with the `/panel` slash command.

```
backend/    Bun REST API over ~/.claude + serves the built UI (port 4317)
frontend/   Vite + React + Tailwind dashboard
shared/     contracts.ts — zod schemas + types shared FE <-> BE
scripts/    launch.sh — boot server + open browser
docs/       design specs
```

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3 (runs the backend and the build)
- A `~/.claude` directory (created by Claude Code)

## Run

```bash
bash scripts/launch.sh        # installs, builds, boots, opens browser
```

Or from Claude Code: `/panel`.

## Safety

- Binds `127.0.0.1` only.
- Every edit is backed up to `~/.claude/.control-panel-backups/` first.
- Skill/MCP removal is a reversible **archive**, never a delete.
- claude.ai-scoped MCP connectors are read-only (manage them in the claude.ai app).

## Optional: Code Trust tab

The **Code Trust** tab integrates with an optional companion tool that writes a
fix inbox to `~/.clean`. If that directory isn't present, the tab simply reports
itself as unavailable — the rest of the panel works without it.

## License

[MIT](LICENSE) © 2026 Nicolas Dos Santos

See `docs/specs/2026-06-14-control-panel-design.md` for the full design.
