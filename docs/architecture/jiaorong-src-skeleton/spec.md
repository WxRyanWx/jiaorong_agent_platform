# jiaorong-src skeleton

## Goal

Create `src/jiaorong_src` as an isolated mini-project for Jiaorong private features (skills hub first), mounted into the open-source host with minimal touchpoints.

## Acceptance Criteria

- `src/jiaorong_src` exists with `api/`, `utils/`, `skills/` (module scaffold).
- Path alias `@jiaorong/*` works for renderer (and is reserved for main).
- Existing QR-login HTTP client lives under `jiaorong_src/api/auth`; old `@api/auth` remains a thin re-export.
- Host registers via a single `mountJiaorong()` entry from renderer bootstrap.
- HOST_TOUCHPOINTS.md lists every host file changed for this scaffold.

## Non-Goals

- Skill hub UI, market list, install flows (later schedule items).
- ~~Full migration of login pages/components into jiaorong_src.~~ → 见 `docs/architecture/jiaorong-login-ui-migrate/`
- Changing auth backend domain or contracts.

## Constraints

- Same auth API origin (`c4ai.ccccltd.cn` / VITE_AUTH_API_ORIGIN).
- Do not rewrite Agent Loop or open-source skill runtime in this slice.
