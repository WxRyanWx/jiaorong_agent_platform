# Node 脚手架清理死文件

## 目标

删掉 `demo-workbench/node` 里改版留下、已无引用的文件和 Egg 运行时转储。不砍 `dispatch` 里前端暂时没用的 method（那是 HTTP 转发面）。

## 验收

1. 无 `constants.js` / `userinfo.js` / 空 `vendor/`。
2. `node/run`、`node/logs` 进 gitignore，仓库不含 dump。
3. `server.js`、三条路由、jiaorong/biz 转发仍在。
