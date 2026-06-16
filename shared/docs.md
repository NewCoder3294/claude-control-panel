# shared/

`contracts.ts` — the single source of truth for every API payload shape, as zod
schemas with inferred TypeScript types. Imported by both backend (validation) and
frontend (typed client). Change a shape here and both sides update.
