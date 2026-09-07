# 主进程 __dirname 丢失

electron-vite ESM shim 用正则找 chunk 里最后一个 `import ... from`。`guestNode.ts` 把带静态 import 的 bootstrap 写进模板字符串，shim 插到字符串内部，主进程 `__dirname` 未定义，启动闪屏崩溃。

## 验收

- bootstrap 源码不含静态 `import ... from`
- `pnpm dev` 能创建闪屏，不再报 `__dirname is not defined`
