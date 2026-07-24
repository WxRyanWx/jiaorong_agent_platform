# 主仓触点清单（HOST_TOUCHPOINTS）

凡修改开源主仓路径，必须在此登记。合上游前优先审查本表。

| ID  | 主仓路径 | 改动类型 | 关联模块 | 风险 | 备注 |
|-----|----------|----------|----------|------|------|
| H01 | `electron.vite.config.ts` | 增加 `@jiaorong` alias | skeleton | 低 | main/preload/renderer |
| H02 | `tsconfig.app.json` / `tsconfig.app.tsgo.json` | include + paths | skeleton | 低 | |
| H03 | `tsconfig.node.json` | paths + include prompts/config/brand | skeleton | 低 | 勿 include Vue |
| H04 | `src/renderer/src/main.ts` | `bootstrapJiaorongRendererAuth` + idle mount + `document.title` | auth+brand | 中 | 经 `@jiaorong/auth/host` / `@jiaorong/brand` |
| H05 | `src/renderer/api/auth/index.ts` | HTTP 兼容 re-export | auth | 低 | 实体在 `jiaorong_src/api/auth` |
| H06 | `src/renderer/src/router/index.ts` | login/skills 经 auth/host + skills/routes | auth+skills | 中 | |
| H07 | `src/renderer/src/components/WindowSideBar.vue` | `listJiaorongSidebarItems` 渲染；auth/host 校验 | skills+auth | 中 | 无硬编码技能按钮 |
| H08 | `src/renderer/src/i18n/*/routes.json` | skills / skillsDetail 文案 | skills | 低 | |
| H09 | `vitest.config.ts` / `vitest.config.renderer.ts` | `@jiaorong` alias | skeleton | 低 | |
| H10 | `test/renderer/components/*.test.ts` | mock `@jiaorong/auth/host` | skills+auth | 低 | |
| H11 | `src/renderer/src/App.vue` | deeplink / getToken 经 auth/host | auth | 中 | |
| H12 | `src/renderer/src/pages/AgentWelcomePage.vue` | forceRevalidate 经 auth/host | auth | 低 | |
| H13 | `src/renderer/index.html` | 已移除全局 sm4 script | auth | 低 | title 亦可由 main.ts 覆盖 |
| H14 | `src/main/.../deeplinkPresenter` + events | `AUTH_LOGIN` 扫码回调 IPC | auth | 高 | 协议层仍宿主 |
| H15 | `src/shared/settingsSidebarAdmin.ts` | 薄 re-export → `@jiaorong/config/...` | config | 低 | |
| H16 | `src/main/.../systemPromptHelper.ts` | 引用 `@jiaorong/prompts/...` | prompts | 中 | 仅默认文案 |
| H17 | `src/main/lib/watermark.ts` | 品牌默认文案 → `@jiaorong/brand` | brand | 低 | |
| H18 | `src/main/.../devicePresenter` | X-Title / UA → `@jiaorong/brand` | brand | 低 | |
| H19 | `src/main/.../artifactsServer.ts` | footer 文案 → `@jiaorong/brand` | brand | 低 | |
| H20 | `devicePresenter.selectFiles` + legacy 类型 | 可选 `allowDirectory`（文件/文件夹同一对话框） | skills upload | 低 | 仅属性透传，无新 API |
| H21 | `filePresenter.writeTemp` + legacy 类型 | 支持 `number[]` 二进制内容（IPC 序列化 Uint8Array） | skills upload | 低 | 上传 md/zip 临时包 |
| H22 | `useSkillsData.ts` | 过滤关闭技能；监听开关事件 | skill switch | 低 | `@jiaorong/utils` |
| H23 | `useChatInputMentions.ts` | slash 技能列表过滤关闭项；打开 `/` 时刷新目录 | skill switch + catalog | 低 | `@jiaorong/utils` `refreshSkillsCatalog` |
| H24 | `skillPresenter/index.ts` | `get/setActiveSkills` 按开关 map 过滤 | skill switch | 中 | 读 `jiaorong_skill_switch_map`；纯逻辑在 `@jiaorong/utils/skillSwitchCore` |
| H25 | `test/renderer/components/WindowSideBar.test.ts` | skills + auth session mock | skills+auth | 低 | |
| H26 | `src/renderer/src/App.vue` | deeplink / getToken 来自 `@jiaorong/auth` | auth | 中 | |
| H27 | `src/renderer/src/pages/AgentWelcomePage.vue` | `forceRevalidateAuthSession` 路径 | auth | 低 | |
| H28 | `src/renderer/index.html` + `public/sm4/*` | 全局 Sm4utils（账号密码登录） | auth | 中 | 本切片暂留宿主 |
| H29 | `src/main/.../deeplinkPresenter` + events | `AUTH_LOGIN` 扫码回调 IPC | auth | 高 | 协议层仍宿主，勿整文件搬走 |
| H30 | `src/renderer/src/stores/ui/draft.ts` / `pages/NewThreadPage.vue` / `components/chat/ChatInputBox.vue` | 通用对话启动参数支持待激活技能，并复用现有 pending skills 流程 | skills | 中 | 交融业务入口与编排保留在 `jiaorong_src`；宿主仅消费通用启动参数 |
| H31 | `src/shared/contracts/routes/skills.routes.ts` / `types/skill.ts` / `src/main/presenter/skillPresenter/index.ts` / `src/main/routes/index.ts` / `src/renderer/api/SkillClient.ts` | 按已发现技能元数据打开或卸载实际 `skillRoot`，并读取真实 `SKILL.md` | skills | 中 | `skills.openFolder` 不传名称时兼容原有打开技能根目录行为；卸载校验目录位于受管技能根目录内；读取复用 Presenter 的文件大小限制 |
| H32 | `skillPresenter/index.ts` | 内置技能升级时整包覆盖同步 | builtin sync | 中 | 内置文件有差异则 `overwrite: true`；内置由应用管理 |
| H33 | `tsconfig.node.json` | include `skillSwitchCore.ts` | skill switch | 低 | 主进程可 typecheck 纯逻辑工具 |
| H34 | `src/renderer/src/main.ts` | 静态 `import '@jiaorong/brand/theme.less'` | brand theme | 低 | 私有主题覆盖；勿经 idle mount |
| H35 | `src/renderer/src/components/AppBar.vue` | `app-bar` class | brand theme | 低 | theme.less 标题栏背景 |
| H36 | `src/renderer/src/components/WindowSideBar.vue` | 注释隐藏左侧主题切换按钮 | brand theme | 低 | 合上游时需保留 |
| H37 | `src/renderer/settings/components/DisplaySettings.vue` | 注释隐藏外观页「主题」设置块 | brand theme | 低 | 合上游时需保留 |
| H38 | `WindowSideBar.vue` | `window-sidebar-shell` / `window-sidebar-empty-*` / `window-sidebar-search-input` / `window-sidebar-action-btn` | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H39 | `ChatInputToolbar.vue` / `ChatInputBox.vue` | `chat-input-toolbar-icon` / `chat-input-box` | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H40 | `src/renderer/src/i18n/*/routes.json` | 技能详情文案键 | skills detail | 低 | skillsBack / Market / UseSkill / OpenFolder / Delete / Try* / DeleteConfirm* |
