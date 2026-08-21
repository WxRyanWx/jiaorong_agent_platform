# 计划

- `electron-builder.yml` 写死 `JiaorongAI-{windows|mac|linux}-${arch}.${ext}`。
- CI matrix.platform：`windows-x64` / `windows-arm64`。
- Linux 打开 `installRuntime:linux`。
- Mac x64 runner 改为 `macos-15-intel`，`fail-fast: false`。
