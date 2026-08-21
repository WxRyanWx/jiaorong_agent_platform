# 手动构建产物对齐 master

## 目标

GitHub 手动「Build Application / Build Test Application」打出和现网一致的安装包文件名，并让 Linux / Mac 能编过。Mac 包保持和旧 master 一样：Chrome 下载后可在「隐私与安全性」里「仍要打开」，用户不必敲 `xattr`。

## 验收

1. 安装包文件名为 `JiaorongAI-windows-x64.exe`、`JiaorongAI-windows-arm64.exe`、`JiaorongAI-mac-x64.{dmg,zip}`、`JiaorongAI-mac-arm64.{dmg,zip}`、`JiaorongAI-linux-x64.{AppImage,tar.gz}`。
2. Artifact 夹名为 `JiaorongAI-windows-x64` 等（`windows` 不是 `win`）。
3. Linux 打包前安装 bundled Node runtime，afterPack OCR 不再 ENOENT。
4. Mac x64 在 `macos-15-intel` 上编 CUA catalog；arm64 仍 `macos-15`。缺公证密钥仍能编。
5. 手动 Mac 包用 `CSC_LINK` 签主程序，CUA helper 在 `plugin:bundle` 时用同一套 Developer ID 签，并写入 `integrity.json` 的 `developer-id` 合同。electron-builder 不得重签 helper（保留 `signIgnore`）。
6. 不设 `build_for_release`，不公证。用户看到的是「无法验证开发者 / 仍要打开」，不是混签导致的「已损坏」。
7. 缺 `CI=true` purpose 时仍能从 `PACKAGE_PURPOSE` 回退，CI 不再因缺 purpose 失败。

## 非目标

- 不改上游 Package Check 的 `verification` 体检，也不改 `_package-*.yml`。
- 不强行补 Apple 公证密钥，也不打开 `build_for_release` 走 distribution 公证。
- 不在安装后自动跑 `xattr`：Gatekeeper 在应用启动前拦截，包内脚本执行不到；也不改成 .pkg postinstall。
