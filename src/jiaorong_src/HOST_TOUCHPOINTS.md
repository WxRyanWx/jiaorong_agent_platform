# 主仓触点清单（HOST_TOUCHPOINTS）

凡修改开源主仓路径，必须在此登记。合上游前优先审查本表。

| ID | 主仓路径 | 改动类型 | 关联模块 | 风险 | 备注 |
|----|----------|----------|----------|------|------|
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
| H23 | `useChatInputMentions.ts` | slash 技能列表过滤关闭项 | skill switch | 低 | `@jiaorong/utils` |
| H24 | `skillPresenter/index.ts` | `get/setActiveSkills` 按开关 map 过滤 | skill switch | 中 | 读 `jiaorong_skill_switch_map`；纯逻辑在 `@jiaorong/utils/skillSwitchCore` |
| H25 | `skillPresenter/index.ts` | 内置技能升级时整包覆盖同步 | builtin sync | 中 | 内置文件有差异则 `overwrite: true`；内置由应用管理 |
| H26 | `tsconfig.node.json` | include `skillSwitchCore.ts` | skill switch | 低 | 主进程可 typecheck 纯逻辑工具 |
