# Plan

## Approach

1. Add `src/shared/appIdentity.ts` with `jiaorongchat` slug, home-dir helpers, deeplink helpers, and legacy migration.
2. Replace hardcoded `.deepchat` runtime paths in config, skills, sessions, and tool runtime roots.
3. Register `jiaorongchat` protocol in deeplink presenter, startup deeplink detection, Linux afterPack, and electron-builder config.
4. Accept legacy `deepchat://` URLs only at parse time during rollout; register only `jiaorongchat` with the OS.
5. Migrate `~/.deepchat` to `~/.jiaorongchat` before skills/session initialization.

## Compatibility

- In-place auto-update continues to work because `appId` stays `com.wefonk.jiaorong`.
- Chat DB and settings remain under Electron `userData` (`JiaorongAI`).
- Server auth callback must switch to `jiaorongchat://chat?token=...` after client release.

## Test Strategy

- Update unit tests for startup deeplink, deeplink presenter, session paths, skill path repair, and Linux afterPack launcher script.
