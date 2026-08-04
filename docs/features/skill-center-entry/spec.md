# skill-center-entry

## Goal

Add Skill Center navigation entry and placeholder list/detail Vue pages under `jiaorong_src`, without fake business logic.

## Acceptance

- Left rail: button after 通用对话 (deepchat), opens `/skills`.
- Placeholder pages exist with a single comment each (no demo UI logic).
- List/detail pages live in separate folders under `skills/pages/` (room for co-located js/css).
- Stub API/utils files are comment-only so teammates do not duplicate implementations elsewhere.
- On `/skills` (and detail), hide the session/conversation list column; icon rail only.
- Leaving skills via an agent icon selects that agent (no accidental toggle to “all agents”).

## Non-Goals

- Market list/detail/install business logic.
