# 计划

## 数据流

1. 渲染进程启动、`bootstrapJiaorongRendererAuth` 完成 token hydrate 后调用
   `startJiaorongProviderApiKeyRefresh()`。
2. `@jiaorong/api/modelCenter` 复用 `@jiaorong/api/auth/interceptors` 的 axios 实例
   （自动注入 `Fusion-Auth`、401 静默续期），调 `project/init` 取首个合法项目 `id`。
3. 再调 `apiKey/create`，把 `data` 交给 `refreshJiaorongProviderApiKey`。
4. `refreshJiaorongProviderApiKey` 通过现有 `createProviderClient().updateProviderAtomic`
   写入 `jiaorong.apiKey` 与 `resolveJiaorongCompatibleBaseUrl()`，现有 `providers.changed`
   事件负责刷新界面。

## 触发点

- `src/renderer/src/main.ts` 在 auth bootstrap 后触发一次；用 `startupRunId` + localStorage
  占位，保证同一次启动即使新开聊天窗口也只换一次 key。
- 私有模块监听 `JIAORONG_AUTH_SESSION_CHANGED_EVENT`，登录 / 退出 / 续期写回时再刷新。

## 兼容性

- 老版本 store 里的旧 key 在启动刷新成功后被覆盖；刷新失败则保留，避免直接不可用。
- 无 token 时写空串，清掉旧账号遗留凭据。
- `enable: true` 不变，`jiaorong` 仍在服务商列表首位。
- `baseUrl` 与 `websites.defaultBaseUrl` 默认值跟随 Vite mode；老配置在启动换 key 时同步校准。

## 测试

- `test/renderer/jiaorong/modelCenter/modelCenterApi.test.ts`：接口路径、请求体、信封校验。
- `test/renderer/jiaorong/provider/apiKeyRefresh.test.ts`：成功写入、无 token 清 key、
  接口失败保留旧 key、同 token 并发去重与成功复用。
- `test/main/provider/defaultProviders.test.ts`：断言默认 key 为空串。
