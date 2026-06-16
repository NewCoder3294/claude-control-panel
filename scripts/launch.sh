#!/usr/bin/env bash
# Launch the Claude Code Control Panel: install/build if needed, boot server, open browser.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT="${CCP_PORT:-4317}"
URL="http://127.0.0.1:${PORT}"

echo "→ Claude Code Control Panel"

# Dependencies
[ -d backend/node_modules ]  || (echo "  installing backend deps…";  cd backend  && bun install)
[ -d frontend/node_modules ] || (echo "  installing frontend deps…"; cd frontend && bun install)

# Bridge: shared/contracts.ts imports "zod"; shared/ has no node_modules of its own,
# so expose zod at the repo root for module resolution to find when walking up.
if [ ! -e node_modules/zod ]; then
  mkdir -p node_modules
  ln -sf ../backend/node_modules/zod node_modules/zod
fi

# Build frontend if missing
if [ ! -f frontend/dist/index.html ]; then
  echo "  building frontend…"
  (cd frontend && bun run build)
fi

# Already running?
if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
  echo "  already running."
else
  echo "  starting server on ${PORT}…"
  CCP_PORT="${PORT}" nohup bun run backend/src/server.ts >/tmp/ccp-panel.log 2>&1 &
  # wait up to 10s for health
  for _ in $(seq 1 20); do
    curl -fsS "${URL}/api/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

echo "  open: ${URL}"
open "${URL}" 2>/dev/null || xdg-open "${URL}" 2>/dev/null || true
