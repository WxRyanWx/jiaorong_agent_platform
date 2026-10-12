# 脚手架 Node 依赖使用 Hoisted 布局

## 目标

`pnpm create jiaorong-app` 生成的应用包在 Windows 解压后可直接启动 Node 服务。

## 验收

- 脚手架生成的 `node/` 含 `.npmrc`，配置 `node-linker=hoisted`。
- pnpm 安装后的 `node/node_modules` 不依赖跨平台符号链接。
- npm 包 `0.1.1` 及以上版本包含该配置文件。

## 非目标

- 不改变客户端解压与启动逻辑。
- 不调整 `web/node_modules` 安装策略。
