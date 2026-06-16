# backend/

Bun server. REST API over `~/.claude` + serves the built frontend (port 4317).

- `src/server.ts` — routing + static serving only.
- `src/config.ts` — paths/constants (honors `CCP_CLAUDE_DIR`, `CCP_PORT`).
- `src/api/*` — one handler module per surface (instructions, memory, mcp, skills,
  commands, settings, contextMap, file).
- `src/lib/*` — pure I/O: `fsutil`, `backup`, `mcpCli`. No HTTP knowledge.
- `src/tests/*` — `bun test`, run against a temp `.claude` via `CCP_CLAUDE_DIR`.

Depends on: `bun`, `zod`, `../shared/contracts.ts`.
