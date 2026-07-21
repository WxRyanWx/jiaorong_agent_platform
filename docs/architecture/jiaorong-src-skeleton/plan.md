# Plan: jiaorong-src skeleton

1. Create `src/jiaorong_src` layout: `api`, `utils`, `skills`, `index.ts`, README, HOST_TOUCHPOINTS.
2. Move `src/renderer/api/auth` → `src/jiaorong_src/api/auth`; leave `@api/auth` re-export.
3. Add Vite/TS aliases `@jiaorong` → `src/jiaorong_src`.
4. Add `mountJiaorong()` and call it once from renderer `main.ts`.
5. Stub `skills` module + `api/skills` market client placeholder.

## Test strategy

- Typecheck/lint for alias + re-export.
- No UI E2E in this slice; login imports must still resolve via `@api/auth`.
