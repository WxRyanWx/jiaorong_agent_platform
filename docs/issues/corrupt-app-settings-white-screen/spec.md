# Corrupt app-settings.json causes white screen

## Problem

Multiple Windows users report a blank main window after install/login. Field evidence shows:

- Main + GPU + renderer processes are running
- `app.asar` is present and sized normally
- `%APPDATA%\JiaorongAI\app-settings.json` is **invalid JSON** (truncated mid-string, often around `defaultProjectPath`)
- `conf` / `electron-store` defaults to `clearInvalidConfig: false`, so `JSON.parse` throws during `new ElectronStore(...)`
- `config-initialization` is a **critical** INIT hook; that throw aborts startup after splash closes → white / empty window

Overwrite reinstall does not fix this because userData is preserved.

## Goal

App must start even when `app-settings.json` (or sibling JSON stores created at config init) is corrupt.

## Acceptance criteria

1. Given a truncated/invalid `app-settings.json`, startup completes and the main UI renders (defaults applied).
2. Corrupt file is quarantined (renamed with timestamp), not silently deleted without a backup copy.
3. Recovery is logged to console/stderr so support can find the backup path.
4. Valid JSON settings continue to load unchanged.
5. Unit tests cover valid file, corrupt file, and missing file.

## Constraints

- Do not require users to manually delete AppData.
- Prefer preserving a backup over discarding evidence.
- Keep change scoped to store bootstrap; do not redesign settings schema in this fix.

## Non-goals

- Full migration/repair of partial JSON values.
- Changing default `loggingEnabled`.
- Fixing every possible GPU white-screen case.

## Related suspicion (ruled out as direct cause)

Master commits `99b6ec9` / `d2a7d3f` (“删除iframe问之的页面”) remove fixed-iframe sidebar entries. That change is a clean deletion (no leftover imports of `@shared/fixedIframeAgents`). It does **not** explain:

- Mac clean reinstall working with the same build
- Field evidence of invalid `app-settings.json` + `conf` throwing on parse

Temporal correlation is expected: users upgraded to the Jul 16 / 0.5.6 build that also shipped the iframe removal, while Windows userData (including a truncated settings file) was preserved across overwrite installs.

## Open questions

None — root cause confirmed from user diagnostics.
