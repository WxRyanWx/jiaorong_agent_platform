# 主仓触点清单（HOST_TOUCHPOINTS）

凡修改开源主仓路径，必须在此登记。合上游前优先审查本表。

| ID | 主仓路径 | 改动类型 | 关联模块 | 风险 | 备注 |
|----|----------|----------|----------|------|------|
| H01 | `electron.vite.config.ts` | 增加 `@jiaorong` alias | skeleton | 低 | main/preload/renderer |
| H02 | `tsconfig.app.json` / `tsconfig.app.tsgo.json` | include + paths | skeleton | 低 | |
| H03 | `tsconfig.node.json` | paths `@jiaorong` | skeleton | 低 | 预留 main |
| H04 | `src/renderer/src/main.ts` | idle `mountJiaorong`；`setupAuthInterceptors` / `saveTokenFromUrl` 来自 `@jiaorong/auth` | skeleton+auth | 中 | 勿静态 import `@jiaorong` 整包做业务 |
| H05 | `src/renderer/api/auth/index.ts` | HTTP 兼容 re-export | auth | 低 | 实体在 `jiaorong_src/api/auth` |
| H06 | `src/renderer/src/router/index.ts` | `/login` → `@jiaorong/auth/...`；`/skills` 懒加载 | auth+skills | 中 | guard/token 来自 `@jiaorong/auth` |
| H07 | `src/renderer/src/components/WindowSideBar.vue` | 技能入口；会话校验 import | skills+auth | 中 | |
| H08 | `src/renderer/src/i18n/*/routes.json` | skills / skillsDetail 文案 | skills | 低 | |
| H09 | `vitest.config.ts` / `vitest.config.renderer.ts` | `@jiaorong` alias | skeleton | 低 | |
| H10 | `test/renderer/components/WindowSideBar.test.ts` | skills + auth session mock | skills+auth | 低 | |
| H11 | `src/renderer/src/App.vue` | deeplink / getToken 来自 `@jiaorong/auth` | auth | 中 | |
| H12 | `src/renderer/src/pages/AgentWelcomePage.vue` | `forceRevalidateAuthSession` 路径 | auth | 低 | |
| H13 | `src/renderer/index.html` + `public/sm4/*` | 全局 Sm4utils（账号密码登录） | auth | 中 | 本切片暂留宿主 |
| H14 | `src/main/.../deeplinkPresenter` + events | `AUTH_LOGIN` 扫码回调 IPC | auth | 高 | 协议层仍宿主，勿整文件搬走 |
| H15 | `src/renderer/src/stores/ui/draft.ts` / `pages/NewThreadPage.vue` / `components/chat/ChatInputBox.vue` | 通用对话启动参数支持待激活技能，并复用现有 pending skills 流程 | skills | 中 | 交融业务入口与编排保留在 `jiaorong_src`；宿主仅消费通用启动参数 |
| H16 | `src/shared/contracts/routes/skills.routes.ts` / `types/skill.ts` / `src/main/presenter/skillPresenter/index.ts` / `src/main/routes/index.ts` / `src/renderer/api/SkillClient.ts` | 按已发现技能元数据打开或卸载实际 `skillRoot`，并读取真实 `SKILL.md` | skills | 中 | `skills.openFolder` 不传名称时兼容原有打开技能根目录行为；卸载校验目录位于受管技能根目录内；读取复用 Presenter 的文件大小限制 |
| H17 | `src/main/appMain.ts` / `src/main/presenter/shortcutPresenter.ts` / `configPresenter/shortcutKeySettings.ts` | 初始化独立截图 IPC，并由宿主注册用户截图快捷键 | screenshot | 中 | 截图程序自身不注册快捷键 |
| H18 | `src/preload/index.ts` / `src/preload/index.d.ts` / `src/renderer/settings/components/ShortcutSettings.vue` | 暴露打开截图 API，并展示截图快捷键设置 | screenshot | 中 | 仅暴露布尔启动结果，不暴露截图内部 IPC |
| H19 | `package.json` / `electron-builder.yml` / `.github/workflows/*` / `scripts/*screenshot-runtime.mjs` | 下载、暂存并只打包当前目标截图运行时 | screenshot | 中 | Release 版本固定，不提交六套大文件 |
