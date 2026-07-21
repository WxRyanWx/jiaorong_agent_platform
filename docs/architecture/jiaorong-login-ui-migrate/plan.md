# Plan

1. `git mv` UI/lib/assets/composables → `src/jiaorong_src/auth/`
2. 修正包内相对路径与资源引用（`@jiaorong/auth/assets/...`）
3. 宿主改 import；`src/renderer/src/lib/auth/*` 改为 re-export shim
4. 注册 `auth/module.ts` 到 `discover`（元数据）；更新 README / HOST_TOUCHPOINTS
5. `typecheck:web` + 侧栏相关测
