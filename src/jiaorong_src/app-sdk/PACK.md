# 打 OSS 包（内部）

本文件不进对外 tgz。对外说明见 README 和组件库文档。

```bash
cd src/jiaorong_src/app-sdk
pnpm install --ignore-workspace
pnpm pack:oss
```

产物：`release/jiaorong-app-sdk-1.0.0.tgz`，上传到

`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`

桥约定见 `HOST_BRIDGE.md`。
