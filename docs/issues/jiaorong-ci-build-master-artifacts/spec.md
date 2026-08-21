# 手动构建产物对齐 master

## 目标

GitHub 手动「Build Application / Build Test Application」打出和 `master` 一样的安装包产物（`JiaorongAI-*`，`dist/` 下 exe/dmg/AppImage），不走上游 `distribution` 公证闸门。

## 验收

1. `build.yml` / `build-test.yml` 内联打包，上传 `dist/*`（排除 unpacked），artifact 名 `JiaorongAI-*` / `JiaorongAI-test-*`。
2. macOS 缺 `DEEPCHAT_APPLE_NOTARY_PASSWORD` 仍能编过（与 master 一致，密钥有则签名）。
3. PR 用的 `_package-*.yml` 不整文件覆盖。

## 非目标

- 不改上游 Package Check 的 `verification` 体检。
- 不强行补 Apple 公证密钥。
