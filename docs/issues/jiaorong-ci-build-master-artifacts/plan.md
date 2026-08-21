# 计划

- `electron-builder.yml` 写死 `JiaorongAI-{windows|mac|linux}-${arch}.${ext}`。
- CI matrix.platform：`windows-x64` / `windows-arm64`。
- Linux 打开 `installRuntime:linux`。
- Mac x64 runner 改为 `macos-15-intel`，`fail-fast: false`。
- 手动 Mac 包：`PACKAGE_PURPOSE=distribution`，`CUA_ALLOW_SIGNED_WITHOUT_NOTARIZATION=1`，保留 `CSC_LINK` 与 `DEEPCHAT_APPLE_NOTARY_TEAM_ID`，不设 `build_for_release`。
- `plugin:bundle` 先用 Developer ID 签 helper 并写 `integrity.json`；electron-builder 再签主程序，yml 的 `signIgnore` 禁止重签 helper。
- `validateCuaSigningContext`：无 `build_for_release` 时，仅当显式允许「只签不公证」才接受 distribution。
- `resolveCuaSigningPurpose` 在未传 CLI purpose 时回退读 `PACKAGE_PURPOSE`。
