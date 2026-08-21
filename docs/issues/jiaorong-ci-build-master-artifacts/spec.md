# 手动构建产物对齐 master

## 目标

GitHub 手动「Build Application / Build Test Application」打出和现网一致的安装包文件名，并让 Linux / Mac 能编过。

## 验收

1. 安装包文件名为 `JiaorongAI-windows-x64.exe`、`JiaorongAI-windows-arm64.exe`、`JiaorongAI-mac-x64.{dmg,zip}`、`JiaorongAI-mac-arm64.{dmg,zip}`、`JiaorongAI-linux-x64.{AppImage,tar.gz}`。
2. Artifact 夹名为 `JiaorongAI-windows-x64` 等（`windows` 不是 `win`）。
3. Linux 打包前安装 bundled Node runtime，afterPack OCR 不再 ENOENT。
4. Mac x64 在 `macos-15-intel` 上编 CUA catalog；arm64 仍 `macos-15`。缺公证密钥仍能编。
5. Mac CI 给 CUA 显式 `verification` purpose（ad-hoc 签名），不再因 `CI=true` 缺 purpose 失败。

## 非目标

- 不改上游 Package Check 的 `verification` 体检。
- 不强行补 Apple 公证密钥，也不打开 `build_for_release` 走 distribution 公证。
