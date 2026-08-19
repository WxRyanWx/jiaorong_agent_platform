# 实现计划

## Product-Id

`api/auth/config.ts` 增加 `resolveAuthProductId()`，与 `resolveAuthApiOrigin()` 共用 mode 表。`debounce-request` 与知识库 MCP `buildCustomHeaders` 改用该函数。删除 `rules.isTrue()`。

## webSecurity

四处窗口改为 `webSecurity: true`。`WindowPresenter` 构造时对 `session.defaultSession` 安装一次性 `webRequest.onHeadersReceived`，filter 仅为当前 mode 的 auth origin。纯函数合并 CORS 头，去掉响应里已有的 `Access-Control-*` 以免重复。更新 H56。

浮窗不打交融 API，只开隔离、不单独装 CORS（共用 defaultSession，主窗已装）。

## 401

`responseErrorFn`：401 时 `clearAuthStorage()`；仅首次（3s 闸门）`callback(5)`。`setupAuthInterceptors` 对 code 5：固定文案 + `resetAuthSessionValidation` + `router.push(login)`。

## 测试

- `resolveAuthProductId` 按 mode
- CORS 头合并
- `responseErrorFn` 401 只 callback(5) 一次
