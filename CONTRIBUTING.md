# Contributing

Thanks for your interest! This is a local-first tool — it reads and writes your
own `~/.claude` directory, so develop against your real config carefully.

## Setup

```bash
bash scripts/launch.sh   # installs deps, builds, boots on http://127.0.0.1:4317
```

## Development

- **Backend** (`backend/`): Bun + TypeScript. `bun test` and `bunx tsc --noEmit` must pass.
- **Frontend** (`frontend/`): Vite + React + Tailwind. `tsc -b` must be clean.
- Shared FE/BE contracts live in `shared/contracts.ts` (zod). Change them in one place.

## Pull requests

- Keep changes focused and match the existing style.
- Conventional commit subjects (`feat:`, `fix:`, `docs:`, …).
- Every edit to user files is backed up first — preserve that safety invariant.
