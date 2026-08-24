# 方案

启动 `bootstrapJiaorongRendererAuth` 在 `app.use(router)` 之前 `hydrateAuthSessionFromConfig`。写入走 `setToken` / `setUserInfoRecords`，登录成功后 `await persistAuthSession()`。`clearAuthStorage` 同时清空 config。

落盘串行排队：每次出队再读当前 localStorage；clear 入同一队列。避免「只有 token」的在途写入盖掉「token+userInfo」或 401 清空。主动退出等待 clear 完成再跳登录。

宿主：`CONFIG_ENTRY_KEYS` + `settingsRoutes.read('jiaorong_auth_session')`。
