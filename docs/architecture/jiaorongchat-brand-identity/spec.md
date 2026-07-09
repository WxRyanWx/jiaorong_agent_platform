# JiaorongChat Brand Identity

## Problem

JiaorongAI still uses DeepChat home-directory and deeplink identifiers (`~/.deepchat`, `deepchat://`), which conflicts with the official DeepChat install and causes skills, sessions, and auth callbacks to land in the wrong app.

## User Story

As a JiaorongAI user, I want the app to use its own `~/.jiaorongchat` data directory and `jiaorongchat://` protocol so it can coexist with official DeepChat and receive scan-login callbacks reliably.

## Acceptance Criteria

- Default skills path is `~/.jiaorongchat/skills` on all platforms.
- Session offload paths use `~/.jiaorongchat/sessions`.
- The app registers and handles `jiaorongchat://` deeplinks on Windows, macOS, and Linux.
- Existing `~/.deepchat` data is migrated to `~/.jiaorongchat` on first startup when the new directory does not exist.
- Persisted legacy `skillsPath` values pointing at `.deepchat` are repaired automatically.

## Non-Goals

- Rename internal SQLite table names, preload bridge names, or plugin IDs.
- Change server-side auth redirect configuration in this repo.

## Constraints

- Keep brand constants in `src/shared/appIdentity.ts`.
- Auto-update must remain compatible with existing installs (`appId` unchanged).
