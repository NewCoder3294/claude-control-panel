# scripts/

- `launch.sh` — installs deps + builds frontend on first run, boots the Bun
  server on `127.0.0.1:4317`, and opens the browser. Idempotent (no-op if already
  running). Invoked by the `/panel` slash command.
