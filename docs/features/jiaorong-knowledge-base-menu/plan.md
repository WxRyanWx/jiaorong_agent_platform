# Plan

镜像技能中心私有模块接入：

1. `knowledgeBase/module.ts`：sidebarItem + `exclusiveChrome`
2. `router/knowledgeBase.meta.ts` + `knowledgeBase.ts`：单路由 `/knowledge-base`
3. `api/knowledgeBase/config.ts`：按 `import.meta.env.MODE` 解析 URL（对齐 auth config）
4. `iframe/index.vue`：全屏 iframe
5. `resolveKnowledgeBaseUrl()` 用 `getToken()`（`xkaitoken`）拼 `?token=`
6. 挂到 `runtime/modules.ts`、`router/index.ts`
7. i18n `routes.knowledgeBase`
