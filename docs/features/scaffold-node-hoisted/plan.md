
# 实现方案

1. 在脚手架模板 `node/_npmrc` 写入 `node-linker=hoisted`，生成后重命名为 `.npmrc`。
2. 将 `_npmrc` 加入 npm 包 `files` 清单，规避 npm 发布丢弃点文件。
3. 升级脚手架包版本为 `0.1.1`。
4. 用本地 tarball 运行 `pnpm create` 验证生成结果。
