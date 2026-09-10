# 打 OSS 包（内部）

本文件不进对外 tgz。对外说明见 README 和组件库文档。

## 仓库内联调（先不上传）

脚手架 `demo-workbench` 的 web / node 默认依赖 OSS：

`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`

改 SDK 源码时，可临时改成 `file:../../../app-sdk`，吃本目录 `dist/`。

```bash
cd src/jiaorong_src/app-sdk
pnpm install --ignore-workspace
pnpm build
cd ../apps/demo-workbench/web && pnpm install --ignore-workspace
cd ../node && pnpm install --ignore-workspace
```

改 SDK 源码后，在 `app-sdk` 目录用本地 `./node_modules/.bin/tsdown` 与 `vite` 出 `dist/`（不要在仓库根执行 `pnpm build`）。`file:` 装进 `web/node_modules` 的拷贝不会自动更新。

测完再打包上传，并把脚手架依赖改回上面的 tgz 地址，重新生成 `web/pnpm-lock.yaml` 与 `node/pnpm-lock.yaml`。

## 上传 OSS

```bash
cd src/jiaorong_src/app-sdk
pnpm install --ignore-workspace
pnpm pack:oss
```

产物：`release/jiaorong-app-sdk-1.0.0.tgz`，上传到

`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`

桥约定见 `HOST_BRIDGE.md`。
