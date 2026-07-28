# Plan

1. `getUserInfo` / `FeatchUserInfo` 支持 `timeout`；会话校验用短超时（5s）。
2. `forceRevalidateAuthSession` 走短超时。
3. 侧栏：有 token 则立即放行导航，后台静默 revalidate；无 token / 后台 401 再跳登录。
4. 欢迎页选 agent：同样不长时间阻塞（短超时 + 失败保本地态）。
5. 单测：session 短超时相关；侧栏 mock 仍通过。
