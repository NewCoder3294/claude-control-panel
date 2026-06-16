# frontend/

Vite + React + TypeScript + Tailwind SPA — the dashboard UI.

- `src/App.tsx` — shell: sidebar + tabbed detail pane.
- `src/views/*` — one component per surface (Instructions, Memory, Mcp, Skills,
  Commands, Settings, ContextMap). Pure rendering against the api client.
- `src/api/client.ts` — typed fetch wrapper using `../../shared/contracts.ts`.
- `src/components/ui/*` — shadcn-style primitives (Button, Card, Tabs, Badge).
- `src/components/FileEditor.tsx` — CodeMirror editor with save + backup status.

Built output (`dist/`) is served by the backend. Depends on: react, vite,
tailwind, `@uiw/react-codemirror`, zod.
