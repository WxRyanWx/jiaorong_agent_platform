# Plan

1. 新增幂等 `ensureShellBootstrap()`：getBootstrap → apply agents/session/project；后台 `fetchAgents`
2. `App.vue`：非登录路由 immediate 触发
3. `ChatTabView`：await 同一 promise，再 `pageRouter.initialize`
