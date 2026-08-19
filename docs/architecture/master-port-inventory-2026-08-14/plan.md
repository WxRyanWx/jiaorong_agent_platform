# master 自 2026-06-15 起全部改动搬迁清单

对照基准：`master` @ `d978929`（feat: 添加管理员，2026-08-14）。  
源提交起点：`ce56c79`（2026-06-15 init）。相对 init 约 **980 文件、+8.4 万 / −3.7 万行**。  
搬迁目标：纯 DeepChat 快照分支（本仓库未来的 `main` 某日切出的 `8.14main`）。

搬法约定：

- **整包拷贝**：目录原样放到新树，再接线
- **接线**：上游文件里加 `@jiaorong` import / class / 一小段逻辑
- **对位改**：上游同文件已变路径，按行为移植，不要整文件覆盖
- **不搬**：用上游更新实现替代（见文末）

---

## 0. `upstream` remote 只对本机有效

`git remote add upstream https://github.com/ThinkInAIXYZ/deepchat.git` 写的是 **你这台电脑仓库里的 `.git/config`**。

| | 是否带上 |
|--|--|
| 你当前这份 clone | 加了才有 |
| GitHub 网页 / 仓库设置 | **不会出现** |
| 同事重新 clone | **没有**，每人要自己加一次 |
| CI | **没有**，workflow 里要另写 `git remote add` |

别人要拉 DeepChat，各自执行同一条命令即可。不能靠 push 把 remote 同步给全员。

本环境未能写入 `.git/config`（权限拒绝）。请你本机执行：

```bash
git remote add upstream https://github.com/ThinkInAIXYZ/deepchat.git
git fetch upstream
# DeepChat 默认主线是 dev
git log -1 --oneline upstream/dev
```

---

## 1. 整包：`src/jiaorong_src`（约 141 文件）— 原样拷贝

这是交融私有包，**不要和上游文件 merge**，整目录拷到新分支后接 alias。

入口：`src/jiaorong_src/index.ts`（`mountJiaorong`）、`HOST_TOUCHPOINTS.md`、`README.md`。

### 1.1 auth（登录）

| 路径 | 做什么 |
|------|--------|
| `auth/pages/LoginPage/LoginPage.vue` + `login.less` | 登录页 |
| `auth/components/CodeLogin.vue` | 扫码 |
| `auth/components/UserCompact.vue` | 侧栏用户条 |
| `auth/lib/session.ts` | token / userInfo / `scheduleAuthRevalidateOnMenuSwitch`（探活超时 5s，不堵导航） |
| `auth/lib/guard.ts` `setup.ts` `bootstrap-before.ts` | 门禁、启动前引导 |
| `auth/lib/auth-deeplink.ts` | 监听 `deeplink:auth-login` |
| `auth/lib/auth-from-url.ts` `local-user.ts` `ensureSm4.ts` | URL/本地用户/按需 SM4 |
| `auth/host.ts` `index.ts` `module.ts` | 宿主薄入口 + 侧栏贡献 |
| `auth/vendor/sm4/*` | 账号密码加密，**不要**再挂回 `renderer/index.html` 全局 script |
| `auth/assets/*` | 登录背景图 |
| `auth/composables/useLoginPageScale.ts` | 登录页缩放 |
| `api/auth/*` | 登录 HTTP、拦截器、环境域名（dev/test→测试服，production→正式服） |

冒烟：扫码登录、账号登录、过期跳登录、侧栏切换不卡死。

### 1.2 skills（技能中心）

| 路径 | 做什么 |
|------|--------|
| `skills/pages/SkillListPage/*` | 市场/已装列表、分类、tab |
| `skills/pages/SkillDetailPage/*` | 详情、试一试、安装/卸载/打开目录 |
| `skills/components/SkillUploadDialog/*` | 上传 zip/md、Win 拖放 |
| `skills/lib/skillMarketCatalog.ts` `skillCategories.ts` `skillMarketTab.ts` | 市场数据与分类（API `deepchat-ext/skill*`） |
| `skills/lib/ensureDefaultSkills.ts` `defaultSkillsManifest.ts` | 默认预装约 19 个市场技能 |
| `skills/lib/sessionSkill.ts` `installLocalSkill.ts` | 会话技能、本地装 |
| `skills/lib/resolveSkillTryPrompts.ts` | 试一试：读 SKILL.md 字段 |
| `skills/lib/formatSkillInstallError.ts` `defaultSkillInstallEvents.ts` | 错误文案/事件 |
| `skills/scripts/generateDefaultSkillsSeedBuildId.mjs` | 构建时生成 seed id（`package.json` prebuild/build 已调） |
| `skills/module.ts` | 侧栏「技能」入口 |
| `api/skills/index.ts` | 市场 HTTP |
| `router/skills.ts` `skills.meta.ts` | `/skills` `/skills/:id` |
| `utils/downloadSkill/*` | zip URL 安装、覆盖确认（**不用** reka AlertDialog，避免 body `pointer-events:none`） |
| `utils/skillSwitch.ts` `skillSwitchCore.ts` | 技能开关；Core 给主进程用 |
| `utils/skillInstall.ts` `skillFileOperations.ts` `refreshSkillsCatalog.ts` | 安装、刷新目录 |
| `utils/startGeneralChatWithSkills.ts` | 「使用技能」进通用对话并带 pending skills |
| `utils/slashSuggestionSort.ts` | `/` 技能中英混排 |
| `assets/skill.png` `skill-market-menu.svg` | 侧栏图标 |

冒烟：侧栏进技能中心、市场安装、详情试一试、卸载、上传、默认技能是否出现、开关过滤 `/` 列表。

### 1.3 knowledgeBase（知识库）

| 路径 | 做什么 |
|------|--------|
| `knowledgeBase/iframe/index.vue` | 知识库 iframe 页 |
| `knowledgeBase/picker/*` | 输入区选择器、chips、发消息前 `prepareKnowledgeBaseSendFiles` |
| `knowledgeBase/mcp/*` | 确保 KB MCP server、给模型的使用说明 |
| `knowledgeBase/module.ts` | 侧栏「知识库」入口 |
| `api/knowledgeBase/*` | KB HTTP + MCP 配置转换 |
| `router/knowledgeBase.ts` `knowledgeBase.meta.ts` | 路由 |
| `assets/knowledge*.svg/png` `kb-file-icons/*` | 图标 |

接线宿主：`ChatPage.vue` / `NewThreadPage.vue` / `MessageItemUser.vue` 调 `prepareKnowledgeBaseSendFiles`。

冒烟：侧栏打开 KB、输入区选库/文件、发送后模型能检索。

### 1.4 brand / prompts / config / logging / runtime

| 路径 | 做什么 |
|------|--------|
| `brand/index.ts` `forceLightTheme.ts` `theme.less` | APP 名、UA、强制 light、主题覆盖 |
| `brand/icons/skill-detail/*` | 详情页图标 |
| `prompts/defaultSystemPrompt.ts` | 交融默认系统提示词（长文案，含语言/工具规范） |
| `prompts/systemPromptFinalize.ts` | 尾注 + Skills 中文说明；**并副作用 import 对话耗时日志 installMain** |
| `prompts/hostPromptLocalize.ts` | 宿主提示词本地化辅助 |
| `config/settingsSidebarAdmin.ts` | 非管理员隐藏设置项 + 手机号/工号白名单 |
| `logging/conversationTiming/*` | 主进程挂钩：轮次耗时、x-trace-id 写本地日志 |
| `runtime/modules.ts` `sidebar.ts` `discover.ts` `types.ts` | 模块登记、侧栏 `listJiaorongSidebarItems`、独占 chrome 路由 |
| `router/index.ts` `router/auth.ts` | `createJiaorongRoutes()` |
| `utils/globalToast.ts` `utils/index.ts` | toast |
| `api/index.ts` | 私有 API 出口 |

---

## 2. 工程骨架（先搬，否则编不过）

| ID | 路径 | 改动 | 搬法 |
|----|------|------|------|
| H01 | `electron.vite.config.ts` | `@jiaorong` → `src/jiaorong_src`（main/preload/renderer 三处） | 接线 |
| H02 | `tsconfig.app.json` `tsconfig.app.tsgo.json` | paths + include 私有目录 | 接线 |
| H03/H33 | `tsconfig.node.json` | paths；include `skillSwitchCore.ts`、prompts/config/brand | 接线 |
| H09 | `vitest.config.ts` `vitest.config.renderer.ts` | `@jiaorong` alias | 接线 |
| — | `package.json` | name=`JiaorongAI`；`prebuild`/`build` 调 `generateDefaultSkillsSeedBuildId.mjs` | 对位改 |
| — | `src/shared/appIdentity.ts` | `jiaorongchat` slug、legacy `.deepchat` 路径兼容 | 整文件拷 + 确认上游是否已有同类文件 |
| — | `src/shared/legacyBrandAliases.ts` | 旧品牌别名 | 拷 |
| — | `src/main/appMain.ts` | `app.setName('JiaorongAI')`；`js-flags --max-old-space-size=4096`（评估是否仍保留） | 对位改 |

---

## 3. 品牌 / 打包 / 协议（用户能看见的壳）

| 路径 | 改动 | 搬法 |
|------|------|------|
| `electron-builder.yml` | `appId: com.wefonk.jiaorong`；`productName: JiaorongAI`；协议 `jiaorongchat`；Win `executableName`；Linux `x-scheme-handler/jiaorongchat` | 对位改，勿整文件覆盖上游新打包字段 |
| `resources/app.ico` | Win 图标 | 拷 |
| `src/renderer/src/assets/llm-icons/duihua.png` | 对话图标 | 拷 |
| `scripts/afterPack.js` `notarize.js` 等 | Linux afterPack、产物名 JiaoRongSuperIntelligentAgent | 对位改 |
| `.github/workflows/build.yml` `release.yml` `build-test.yml` `windows-arm64-e2e.yml` | 产物名、测试包工作流、去签名等 | **按你们 CI 现实重接**，不要盲拷死掉的 Gitee 流水线 |
| 根目录若有 `*-pipeline.yml` | 历史 Gitee/内部流水线 | 单独确认还用不用 |

冒烟：安装包名、协议唤起、图标、Win/Mac/Linux 各打一包。

---

## 4. HOST 触点（开源路径上的交融接线）

上游若已改路径（Chat 进 `features/` 等），**按「行为」移植，不要按旧路径覆盖。**

### 4.1 登录 / 路由 / 侧栏

| ID | 路径 | 必须保留的行为 |
|----|------|----------------|
| H04 H34 | `src/renderer/src/main.ts` | `bootstrapJiaorongRendererAuth`；**静态** `import '@jiaorong/brand/theme.less'`（不能 idle）；`document.title` |
| H05 | `src/renderer/api/auth/index.ts` | 薄 re-export → `@jiaorong/api/auth` |
| H06 | `src/renderer/src/router/index.ts` | `createJiaorongRoutes()` 合并 login/skills/kb |
| H07 H36 H38 H53 | `WindowSideBar.vue` | `listJiaorongSidebarItems`；`iconSrc` 用 `<img>`；隐藏主题切换；挂 `window-sidebar-*` class；菜单切换走 `scheduleAuthRevalidateOnMenuSwitch` 且不 await 堵 UI |
| H11 H26 | `App.vue` | deeplink / `getToken` 走 `@jiaorong/auth/host` |
| H12 H27 H53 | `AgentWelcomePage.vue` | `forceRevalidateAuthSession` 不堵；选 Agent 同样 schedule 探活 |
| H13 | `src/renderer/index.html` | **不要**恢复全局 sm4 script |
| H14 H29 | `deeplinkPresenter` + `src/main/events.ts` + `src/renderer/src/events.ts` | 增加 `AUTH_LOGIN` / `deeplink:auth-login`，扫码回调进渲染进程。协议层留宿主 |
| H55 | `ChatTabView.vue` | 路由初始化用 **live** `sessionStore.activeSessionId`，禁止只用 bootstrap 缓存（否则技能「使用」回到旧会话） |

### 4.2 主进程技能 / 提示词 / 品牌

| ID | 路径 | 必须保留的行为 |
|----|------|----------------|
| H16 | `systemPromptHelper.ts` | 默认文案从 `@jiaorong/prompts/defaultSystemPrompt` 来 |
| H42 | `agentRuntimePresenter/index.ts` | `finalizeJiaorongSystemPrompt`（尾注在 summary/handoff 之后）；会间接触发 conversationTiming `installMain` |
| H24 | `skill/index.ts` `skill/settings.ts` | `get/setActiveSkills` 用 `jiaorong_skill_switch_map` + `filterEnabledSkillNamesFromSetting`；关闭不走 `setSkillDisabled` |
| H32 | 同上 | 内置技能升级 **整包 overwrite**，不只同步 frontmatter |
| H31 | `skills.routes.ts`、`types/skill.ts`、`routes/index.ts`、`SkillClient.ts`、skillPresenter | `openFolder` 可按元数据打开真实 `skillRoot`；卸载必须在受管技能根内；读 SKILL.md 有大小限制 |
| H20 | `devicePresenter.selectFiles` + legacy 类型 | 可选 `allowDirectory` |
| H21 | `filePresenter.writeTemp` | 支持 `number[]`（IPC 后的 Uint8Array） |
| H17 | `watermark.ts` | 文案 `@jiaorong/brand` |
| H18 | `devicePresenter` | X-Title / UA `@jiaorong/brand` |
| H19 | `artifactsServer.ts` | footer `@jiaorong/brand` |
| H41 | `configPresenter/index.ts` `initTheme` | 非 light 则 `setTheme('light')`，判定 `needsForceLightTheme` |
| H15 | `src/shared/settingsSidebarAdmin.ts` | re-export `@jiaorong/config/settingsSidebarAdmin` |

### 4.3 渲染技能接线

| ID | 路径 | 行为 |
|----|------|------|
| H22 | `useSkillsData.ts` | 过滤关闭技能；听开关事件 |
| H23 | `useChatInputMentions.ts` | `/` 列表过滤关闭项；打开 `/` 时 `refreshSkillsCatalog` |
| — | `mentions/utils.ts` | 同样走 `@jiaorong` 排序/过滤 |
| H30 | `draft.ts` `NewThreadPage.vue` `ChatInputBox.vue` | 启动参数带 `activeSkills` / pending skills；「使用技能」进新对话 |
| H08 H40 | `i18n/*/routes.json` | skills / skillsDetail 全套键（Back/Market/UseSkill/OpenFolder/Delete/Try/DeleteConfirm…）**所有语言都要** |

### 4.4 品牌 class（theme.less 靠这些选择器）

| ID | 路径 | class / 行为 |
|----|------|----------------|
| H35 | `AppBar.vue` | `app-bar` |
| H37 H47 H48 | `DisplaySettings.vue` + Font 段 | **注释隐藏「主题」块**；`settings-display-*` |
| H39 | `ChatInputToolbar.vue` `ChatInputBox.vue` | `chat-input-toolbar-icon` `chat-input-box` |
| H43 | `settings/main.ts` | 静态 theme.less |
| H44–H52 | 设置壳、通用、环境、Agents、快捷键、关于 | 表中那些 `settings-*` class，缺一个主题就错位 |
| H54 | `stores/ui/session.ts` | 再点当前会话 / activate 竞态 **不清空** provider·model |

### 4.5 测试 mock

| ID | 路径 |
|----|------|
| H10 H25 | `test/renderer/components/WindowSideBar.test.ts` 等 mock `@jiaorong/auth/host` |
| — | `test/renderer/jiaorong/**` 整目录拷贝（auth/skills/kb/utils） |
| — | `test/renderer/lib/slashMenuDisplayText.test.ts` |
| — | ChatPage / AgentWelcomePage / draft / sessionStore 里交融相关断言 |

---

## 5. HOST 表没收全、但 master 上必须搬的宿主改动

这些是 6.15 之后的产品/修复，**搬的时候按文件搜补上**。

### 5.1 会话列表 / 聊天性能（master 自研）

| 项 | 路径 | 行为 | 新分支建议 |
|----|------|------|------------|
| 侧栏第二页 cursor IPC | `SessionClient.listLightweight`：plain `{updatedAt,id}` | 否则 Win/Mac 会话 >30 条翻页失败 | **要搬**（上游 store 层也有 clone，Client 层双保险可留） |
| 消息分页 cursor IPC | `SessionClient.listMessagesPage` + `stores/ui/message.ts` `toPlainMessagePageCursor` | 上翻否则 clone 失败 | **要搬** |
| 首屏加快 | `ChatPage` restore 立即执行；`selectSession` 先 `goToChat` 再 `activate`；首屏 8 条、上翻 16 条 | | 若上游已有窗口化/滚动所有权，**对行为**，不要整文件覆盖 ChatPage |
| 上翻预取 | 距顶 `max(200px, 0.25*视口)`；wheel 贴顶也触发；一次一页；overflow-anchor + ≥2px JS 回退；关 row `content-visibility`；切会话重置 fill/settle | | 优先采用上游 #1866/#1974 窗口化；只补上游没有的预取/闸门 |
| 侧栏仍 `includeSubagents: true` | `session.ts` 约 504、543 行 | 上游 #1772 已改 false + `ensureSessionListFilled` | **不要把 true 当正确行为搬**；用上游 false + 补拉 |

### 5.2 默认行为 / 运营向

| 项 | 大约位置 | 行为 |
|----|----------|------|
| 跳过引导 | `autoCompletePreconfiguredOnboarding.ts` + 调用点 | 已预配 provider 则自动 complete 引导 |
| 默认 Interleaved Thinking | `ModelConfigDialog` / `modelConfig.ts` | 兼容模型默认开 |
| 默认开 MCP | 配置/初始化 | 确认 master 里改的是哪份 default json |
| CSS 隐藏设置项 | 除 theme.less 外，早期还有 css 藏内置智能体/skills | 与管理员白名单叠加，搬时对一下是否仍需要 |
| 修改 AI 新动向 / 智能体广场 URL | 欢迎页或配置 | 产品链接，对位改 |
| 请求失败文案 | i18n / 错误 toast | 对位改 |
| 中交头条隐藏 tabs | iframe/资讯相关（后期删了问之页） | 确认 master 是否还留入口 |
| 轮询登录是否过期 | auth session | 已在 `scheduleAuthRevalidate` / 登录态，勿漏 |
| 管理员白名单 | `settingsSidebarAdmin.ts` 手机号列表 | **整表拷贝**，漏一个运营会认为权限坏了 |
| Win 覆盖安装 | `cdaeec0` win覆盖问题 | 安装器/升级策略，对位改 |
| 悬浮按钮拖拽 | `0ea9b64` | `floating` 渲染进程，对位改 |
| 悬浮按钮位置持久化 | docs/issues 有 spec | 对位改 |
| Linux 注册协议 | electron-builder + afterPack | 见 §3 |
| 去免责声明 / 改智能体文案 | 欢迎页、关于页 | 对位改 |

### 5.3 工具中文名 / 提示词 / 日志

| 项 | 路径 | 行为 |
|----|------|------|
| 工具展示中文 | `src/shared/lib/toolDisplayMetadata.ts`；`useToolDisplayLabelOptions.ts`；`MessageBlockToolCall.vue`；`ThinkContent.vue`；内置 SKILL.md 的 `metadata.displayName` | 调用名仍英文，UI 中文。指南：`docs/guides/skill-tool-display-localization.md` |
| slash 展示 | `slashMenuDisplayText.ts` + `jiaorong_src/tools/toolDisplayNames.ts` | runtime displayName 优先；缺省走静态对照表（H117） |
| 斜杠插入 | `mentions/utils.ts` | 选工具写入 `@${item.label} `，与列表中文一致（H119）；函数 name 仍英文 |
| 技能芯片 | `SkillChipView.vue` `SessionSkillsIndicator.vue` | `getSkillDisplayLabel`（H120） |
| 默认系统提示词 | 见 1.4，极长，必须用交融版 |
| 对话耗时日志 | `logging/conversationTiming` 经 `systemPromptFinalize` 侧载 `installMain` | 确认新分支 main 进程 hook 点还在 |

### 5.4 知识库设置页（若仍走宿主 settings）

`src/main/presenter/configPresenter/knowledgeConfHelper.ts`、duckdb 等可能是上游知识库 + 交融 MCP。搬时区分：

- 上游自带 Knowledge settings：跟上游
- 交融 picker/iframe/MCP instructions：跟 `jiaorong_src`

### 5.5 其它新增宿主文件（相对 init 的 A）

| 路径 | 说明 |
|------|------|
| `src/main/presenter/configPresenter/jsonStoreRecovery.ts` | 损坏 app settings 白屏恢复 |
| `src/renderer/src/lib/shellBootstrap.ts` | 壳启动 |
| `src/shared/sidebarAgents.ts` | 侧栏 agent 相关 |
| `resources/skills/jiaorong-settings/SKILL.md` | 交融设置技能（name 仍英文 slug） |

内置技能目录 `resources/skills/*`（14 个 SKILL.md，含 jiaorong-settings）随包带走，并保留 H32 整包同步。

---

## 6. 内置技能 / 默认市场技能

**内置（随安装包，H32 升级覆盖）：**

`algorithmic-art` `code-review` `doc-coauthoring` `docx` `frontend-design` `git-commit` `infographic-syntax-creator` `jiaorong-settings` `mcp-builder` `pdf` `pptx` `skill-creator` `web-artifacts-builder` `xlsx`

**默认市场种子（`DEFAULT_MARKET_SKILLS`，约 19 个中文 name）：**  
施工方案审核专家、24清单-…、文章去AI味工具、施工方案通用审查、施工作业安全督察、严格代码审查、超级前端设计、BigPlan、产品经理综合技能、解决方案专家、软件测试用例设计、标书大师、企业背景调查 PLUS、招投标合规检查、合同法务助手、ProcessOn思维导图，以及 manifest 里其余项。  
构建脚本生成 `defaultSkillsSeedBuildId.generated.ts`。

---

## 7. i18n

至少这些 namespace 在 `zh-CN` 相对 init 有改，且 **必须同步所有 locale**（H08/H40）：

`routes.json` `settings.json` `chat.json` `common.json` `about.json` `welcome.json` `mcp.json` `dialog.json` `sync.json` `update.json`

搬法：以交融中文为准，跑项目 `pnpm run i18n` 补其它语言，不要只拷 zh-CN。

---

## 8. 测试目录（一并搬）

```
test/renderer/jiaorong/auth/
test/renderer/jiaorong/skills/
test/renderer/jiaorong/knowledgeBase/
test/renderer/jiaorong/utils/
test/renderer/lib/slashMenuDisplayText.test.ts
```

以及改过的：`WindowSideBar.test.ts` `ChatPage.test.ts` `AgentWelcomePage.test.ts` `draft.test.ts` `sessionStore.test.ts` `messageStore.test.ts` `mcpStore.test.ts` 等（只移植交融断言，不要覆盖上游新增用例）。

---

## 9. 文档

`docs/features/jiaorong-*`、`docs/issues/jiaorong-*`、`docs/architecture/jiaorong-*`、`docs/guides/skill-tool-display-localization.md` 可拷到新分支作决策记录。  
**不是运行时依赖**，可后搬。

`.agents/skills/jiaorong-sdd*` 若新分支还用 SDD 则拷。

---

## 10. 不要当「正确实现」搬回去的

| master 现状 | 原因 |
|-------------|------|
| 聊天全量挂载、无 spacer 窗口化 | 上游 #1866 已修；Win 上翻卡正因缺这个 |
| 侧栏 `includeSubagents: true` | 上游 #1772 应改为 false + ensureFilled |
| Skill 热路径大量 `readFileSync` | 上游 #1842；首发卡死相关 |
| 首轮把全部 SKILL.md 塞进 system prompt | 上游 #2147 渐进披露更优 |
| `max-old-space-size=4096` | 可暂留，窗口化后评估降回 |
| 早期 Gitee 流水线、反复「移除签名」 | 按现网 CI 重接 |
| 悬浮球拖拽 pointer-capture / `getCursorScreenPoint` | 上游已有完整拖拽+吸附+位置 persist；整文件覆盖会回退 widget |
| `toolDisplayMetadata.ts` 静态对照表 | 已落到 `jiaorong_src/tools/toolDisplayNames.ts`，`slashMenuDisplayText` 缺 displayName 时回退（H117） |
| Win 覆盖安装 `cdaeec0` | `SkillUploadDialog` 已含 overwrite / 预卸载 |

---

## 10.1 2026-08-18 对照 master 内容复扫

980 条是 `ce56c79`→`d978929` 的 **git 路径清单**（147 个提交），含大量 DeepChat 自身演进，不是 980 个待搬产品功能。

二次核对：`git diff --name-only` 与 `files.md`「master 路径」列 **980=980，0 条漏记**。`src/jiaorong_src` master 141 个文件当前都在（工作区多 `tools/toolDisplayNames.ts`）。

特征串（交融 / jiaorongchat / speLabel / Fusion-Auth / jrsi / 知识库检索 / getSkillDisplayLabel 等）在当前树均有等价实现；技能市场、知识库 picker+MCP、默认开 MCP、详情页自适应等产品提交已落在 `jiaorong_src`。

| 判定 | 结论 |
|------|------|
| files.md 路径覆盖 | 无漏记 |
| `jiaorong_src` | 齐全 |
| HOST 展示接线 | 斜杠插入 H119、技能芯片 H120、底栏 `import ModelIcon` H118 已补 |
| files.md「当前树缺失」98 | 旧 `presenter/*` 等路径，已映射到 `mcp`/`tool`/`agent` |
| 仍不搬 | 窗口化聊天、悬浮球拖拽、`includeSubagents: true`、Gitee、CUA Swift、`source: 'DeepChat'` |
| 可选、非功能洞 | 部分设置文案 `JiaorongAI` vs master「交融超级智能体」；B-i18n 其它 locale；文档可后搬 |

---

## 11. 按切片的文件核对表（搬完打勾）

**切片 A 能编译启动**

- [x] `electron.vite.config.ts` alias
- [x] 三个 tsconfig
- [x] vitest alias
- [x] `src/jiaorong_src/**` 全在
- [x] `appIdentity` `legacyBrandAliases`
- [x] `package.json` 脚本 + seed 生成
- [x] `electron-builder.yml` 身份/协议

**切片 B 登录进首页**

- [x] router 合入 jiaorong 路由
- [x] main.ts bootstrap + theme.less
- [x] deeplink AUTH_LOGIN 主进程 + events 双端
- [x] App.vue token/deeplink（现 `ChatMainApp.vue`）
- [x] LoginPage 能开、扫码/账密

**切片 C 侧栏与设置**

- [x] WindowSideBar 私有入口 + iconSrc + 鉴权不堵 + 隐藏主题钮 + class
- [x] settingsSidebarAdmin 白名单
- [x] 设置页 theme class + 隐藏主题块
- [x] ChatTabView live session id

**切片 D 技能**

- [x] skillPresenter 开关过滤 + 整包 sync + openFolder/uninstall（开关走 setSkillDisabled）
- [x] SkillClient / skills.routes
- [x] useSkillsData / mentions / draft pending skills
- [x] NewThreadPage activeSkills
- [x] 默认种子 + 试一试 md 字段
- [x] i18n routes 技能键
- [x] `jiaorong-settings` 内置技能

**切片 E 知识库**

- [x] 侧栏 + iframe 路由
- [x] ChatPage/NewThreadPage/MessageItemUser prepareKB
- [x] KB MCP ensure + instructions

**切片 F 主进程文案与设备**

- [x] systemPromptHelper + finalizeJiaorongSystemPrompt
- [x] watermark / UA / artifacts footer
- [x] force light theme
- [x] selectFiles allowDirectory / writeTemp number[]
- [x] conversationTiming hooks
- [x] 工具中文名：接线 slashMenuDisplayText / displayCatalog + 静态对照表（H117）

**切片 G 聊天差异（对行为，慎覆盖）**

- [x] SessionClient 两个 cursor plain clone
- [x] message store toPlainMessagePageCursor
- [x] selectSession 乐观导航 / 再点击不清模型
- [x] 上翻分页（或上游窗口化已覆盖则只补缺口）
- [x] session store 再点击不清模型
- [x] 预配 Provider 跳过引导
- [x] MCP 默认开
- [x] JSON store 损坏隔离
- [x] shellBootstrap 抽到 ChatMainApp（技能页不卸水合）
- [x] 侧栏 Agent 分区（deepchat → 技能/KB → 用户 Agent）

**切片 H 打包与回归**

- [x] 图标、产物名、协议
- [x] Linux afterPack 用真实 executableName；启动脚本首次运行注册 `jiaorongchat://`（H103，不整文件覆盖）
- [x] `SkillSettings.getPath()` 按 master 修复并写回 `skillsPath`（H107）
- [x] 会话根目录走 `appIdentity.getSessionsRoot()`（H108）
- [x] 新会话项目选择器 `mb-6` 包在 Dropdown 外；`jiaorong` 模型图标；非管理员不展示高级配置「模型设置」（H109）
- [x] 技能中心「创建技能」按 master `activateSkill` 带入芯片；编辑器 `setContent` 抛错不丢技能（H110）
- [x] 输入框知识库回显区按 master `.chat-input-attachments` 恢复 max-height + 滚动（H111）
- [x] 模型选择 logo 按 master 把尺寸 class 打在 img 上并去掉 opacity-0 门闩（H112）
- [x] 模型 logo `max-width:none` 抗 preflight；Tailwind 扫描 `jiaorong_src`；独占路由不挂收起钮/会话列（H113）
- [x] 删除重复 `deepchat-settings`；上游新增 `memory-management`/`jiaorong-cli` 写入中文 displayName+description（H114）
- [x] 历史网页检索卡片兼容 `application/deepchat-webpage`（H115）
- [x] 主进程 `get/setActiveSkills` 按 `jiaorong_skill_switch_map` 过滤；开关 map 写入 config；关闭不再 `setSkillDisabled`（H24）
- [x] GitHub 测试环境打包 `build-test.yml` + `build:test`（H116）
- [x] 设置记忆页保持可见；插件设置页从非管理员隐藏名单拿掉
- [x] 静态工具中文名对照表：`knowledge_base_retrieve`→知识库检索（H117）
- [x] 管理员底栏模型选择按 providerId 画服务商 logo（H118）
- [x] 斜杠选工具插入 `@中文展示名 `（H119）
- [x] 技能芯片 / 会话技能指示器 `getSkillDisplayLabel`（H120）
- [x] CI 产物身份（`JiaorongAI.app` / `JiaorongAI.exe`）；Gitee 流水线不盲拷；publish 已接 generic `jrsi`
- [x] test/renderer/jiaorong
- [ ] Win 上翻 + 新会话发送 + 登录 + 技能 + KB 冒烟
- [x] 工具气泡中文名接线 / 侧栏分区 / shellBootstrap / Linux afterPack
- [x] 悬浮球拖拽：**不搬**（上游已修）
