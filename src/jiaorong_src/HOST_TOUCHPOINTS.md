# 主仓触点清单（HOST_TOUCHPOINTS）

凡修改开源主仓路径，必须在此登记。合上游前优先审查本表。

| ID  | 主仓路径 | 改动类型 | 关联模块 | 风险 | 备注 |
|-----|----------|----------|----------|------|------|
| H01 | `electron.vite.config.ts` | 增加 `@jiaorong` alias | skeleton | 低 | main/preload/renderer |
| H02 | `tsconfig.app.json` / `tsconfig.app.tsgo.json` | include + paths | skeleton | 低 | 排除 `jiaorong_src/**/scripts`，Node CLI 脚本不要进 renderer typecheck |
| H03 | `tsconfig.node.json` | paths + include prompts/config/mcp/brand/logging/auth config | skeleton | 低 | 勿 include Vue；`api/auth/config.ts` 供主进程 CORS filter |
| H04 | `src/renderer/src/main.ts` | `await bootstrapJiaorongRendererAuth` + idle mount + `document.title` | auth+brand | 中 | 经 `@jiaorong/auth/host` / `@jiaorong/brand`；bootstrap 内 await 技能开关 hydrate |
| H04 | `src/renderer/src/main.ts` | `await bootstrapJiaorongRendererAuth` + idle mount + `document.title` | auth+brand | 中 | 经 `@jiaorong/auth/host` / `@jiaorong/brand`；bootstrap 内 await 技能开关 hydrate |
| H05 | `src/renderer/api/auth/index.ts` | HTTP 兼容 re-export | auth | 低 | 实体在 `jiaorong_src/api/auth` |
| H06 | `src/renderer/src/router/index.ts` | login/skills 经 auth/host + skills/routes | auth+skills | 中 | |
| H07 | `src/renderer/src/components/WindowSideBar.vue` | `listJiaorongSidebarItems` 渲染；`iconSrc` 图片图标；auth/host 校验 | skills+auth | 中 | 无硬编码技能按钮；有 `iconSrc` 时渲染 `<img>` |
| H08 | `src/renderer/src/i18n/*/routes.json` | skills / skillsDetail 文案 | skills | 低 | |
| H09 | `vitest.config.ts` / `vitest.config.renderer.ts` | `@jiaorong` alias | skeleton | 低 | |
| H10 | `test/renderer/components/*.test.ts` | mock `@jiaorong/auth/host` | skills+auth | 低 | |
| H11 | `src/renderer/src/App.vue` | deeplink / getToken 经 auth/host | auth | 中 | 曾记 H26，已合并 |
| H12 | `src/renderer/src/pages/AgentWelcomePage.vue` | forceRevalidate 经 auth/host | auth | 低 | 选 Agent 不 await 堵 UI；曾记 H27，已合并 |
| H13 | `src/renderer/index.html` | 已移除全局 sm4 script | auth | 低 | title 亦可由 main.ts 覆盖 |
| H14 | `src/main/.../deeplinkPresenter` + events | `AUTH_LOGIN` 扫码回调 IPC | auth | 高 | 协议层仍宿主，勿整文件搬走；曾记 H29，已合并 |
| H15 | `src/shared/settingsSidebarAdmin.ts` | 薄 re-export → `@jiaorong/config/...` | config | 低 | |
| H15b | `src/renderer/settings/App.vue` `settings/main.ts` | 非管理员侧栏项 `hidden`；默认进通用 | config | 中 | `isSettingsSidebarItemVisuallyHidden`；落地 `getDefaultSettingsRouteName`；白名单号码不要改 |
| H16 | `src/main/.../systemPromptHelper.ts` | 引用 `@jiaorong/prompts/...` | prompts | 中 | 仅默认文案 |
| H17 | `src/main/lib/watermark.ts` | 品牌默认文案 → `@jiaorong/brand` | brand | 低 | |
| H18 | `src/main/.../devicePresenter` | X-Title / UA → `@jiaorong/brand` | brand | 低 | |
| H19 | `src/main/.../artifactsServer.ts` | footer 文案 → `@jiaorong/brand` | brand | 低 | |
| H20 | `devicePresenter.selectFiles` + legacy 类型 | 可选 `allowDirectory`（文件/文件夹同一对话框） | skills upload | 低 | 仅属性透传，无新 API |
| H21 | `filePresenter.writeTemp` + legacy 类型 | 支持 `number[]` 二进制内容（IPC 序列化 Uint8Array） | skills upload | 低 | 上传 md/zip 临时包 |
| H22 | `useSkillsData.ts` | 过滤关闭技能；监听开关事件 | skill switch | 低 | `@jiaorong/utils`；目录、会话钉选、pending consume 都过滤 |
| H23 | `useChatInputMentions.ts` / `mentions/utils.ts` | slash 过滤关闭项；打开 `/` 刷新目录；CJK 排序；选工具插入中文 label | skill switch + catalog | 低 | `@jiaorong/utils` `refreshSkillsCatalog` / `compareSlashSuggestionLabels`；`insert-tool` 用 `item.label`（H119） |
| H24 | `src/main/skill/index.ts` `skill/settings.ts` `config.routes.ts` | `get/setActiveSkills` 读 `jiaorong_skill_switch_map`；开关不改 assignment | skill switch | 中 | 过滤只影响返回/激活，不写回会话钉选；关闭后 `getMetadataList` 对所有 Agent 隐藏；开启不再 `setSkillDisabled(false)` |
| H25 | `test/renderer/components/WindowSideBar.test.ts` | skills + auth session mock | skills+auth | 低 | |
| H28 | `src/jiaorong_src/auth/lib/ensureSm4.ts` + `auth/vendor/sm4` | 账号密码登录按需加载 SM4 | auth | 中 | `public/sm4` 与 `index.html` 全局 script 已无；宿主仅 H13 记移除 |
| H30 | `src/renderer/src/stores/ui/draft.ts` / `pages/NewThreadPage.vue` / `components/chat/ChatInputBox.vue` | 通用对话启动参数支持待激活技能，并复用现有 pending skills 流程 | skills | 中 | 交融业务入口与编排保留在 `jiaorong_src`；宿主仅消费通用启动参数 |
| H31 | `src/shared/contracts/routes/skills.routes.ts` / `types/skill.ts` / `src/main/skill/index.ts` / `src/main/skill/routes.ts` / `src/renderer/api/SkillClient.ts` | 按已发现技能元数据打开或卸载实际 `skillRoot`，并读取真实 `SKILL.md` | skills | 中 | `skills.openFolder` 不传名称时兼容原有打开技能根目录行为；卸载走 `deleteSkill` 并校验受管目录 |
| H32 | `src/main/skill/index.ts` | 内置技能升级时整包覆盖同步 | builtin sync | 中 | 内置文件有差异则 `overwrite: true`；内置由应用管理 |
| H33 | `tsconfig.node.json` | include `skillSwitchCore.ts` | skill switch | 低 | 主进程可 typecheck 纯逻辑工具 |
| H34 | `src/renderer/src/main.ts` | 静态 `import '@jiaorong/brand/theme.less'` | brand theme | 低 | 私有主题覆盖；勿经 idle mount |
| H35 | `src/renderer/src/components/AppBar.vue` | `app-bar` class | brand theme | 低 | theme.less 标题栏背景 |
| H36 | `src/renderer/src/components/WindowSideBar.vue` | `v-if="false"` 隐藏左侧主题切换按钮 | brand theme | 低 | 合上游时需保留 |
| H37 | `src/renderer/settings/components/DisplaySettings.vue` | `v-if="false"` 隐藏外观页「主题」设置块 | brand theme | 低 | 合上游时需保留 |
| H38 | `WindowSideBar.vue` | `window-sidebar-shell` / `window-sidebar-empty-*` / `window-sidebar-search-input` / `window-sidebar-action-btn` | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H39 | `ChatInputToolbar.vue` / `ChatInputBox.vue` | `chat-input-toolbar-icon` / `chat-input-box` | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H40 | `src/renderer/src/i18n/*/routes.json` | 技能详情文案键 | skills detail | 低 | skillsBack / Market / UseSkill / OpenFolder / Delete / Try* / DeleteConfirm* |
| H41 | `src/main/presenter/configPresenter/index.ts` `initTheme` | 启动非 light 则强制 `setTheme('light')` | brand theme | 低 | 判定在 `@jiaorong/brand` `needsForceLightTheme` |
| H42 | `src/main/agent/deepchat/resources/systemPromptBuilder.ts` | `finalizeJiaorongSystemPrompt`；Skills 段中文说明 + `jiaorong_question` | prompts | 中 | 标题仍 `## Skills` 以免上游测试断；正文中文 |
| H43 | `src/renderer/settings/main.ts` | 静态 `import '@jiaorong/brand/theme.less'` | brand theme | 低 | 设置窗口加载私有主题覆盖 |
| H44 | `src/renderer/settings/App.vue` | `settings-page-*` / `settings-navigation-*` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H45 | `src/renderer/settings/components/CommonSettings.vue` | `settings-general-page` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H46 | `src/renderer/settings/components/control-center/SettingsPageShell.vue` | `settings-page-eyebrow` / `settings-page-description` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H47 | `src/renderer/settings/components/DisplaySettings.vue` | `settings-display-page` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H48 | `src/renderer/settings/components/display/FontSettingsSection.vue` | `settings-display-font-reset` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H49 | `src/renderer/settings/components/EnvironmentsSettings.vue` | `settings-environments-page` / `settings-environment-path` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H50 | `src/renderer/settings/components/DeepChatAgentsSettings.vue` | `settings-agents-*` class；非管理员隐藏内置 Agent 编辑 | brand+admin | 中 | `id==='deepchat'` 且非白名单不渲染 editor |
| H51 | `src/renderer/settings/components/ShortcutSettings.vue` | `settings-shortcuts-page` / `settings-shortcut-input` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H52 | `src/renderer/settings/components/AboutUsSettings.vue` | `settings-about-page` / `settings-about-description` / `settings-about-update-*` class | brand theme | 低 | 仅挂 class，样式在 theme.less |
| H53 | `WindowSideBar.vue` / `AgentWelcomePage.vue` | 菜单/选 Agent 鉴权改为不阻塞导航 | auth | 中 | `scheduleAuthRevalidateOnMenuSwitch`；userInfo 探活超时 5s |
| H54 | `src/renderer/src/stores/ui/session.ts` | 激活会话时按摘要 id 决定是否清空模型 | session UI | 低 | 再点当前会话/activate 竞态不丢 provider·model；私有目录无法覆盖 store |
| H55 | `src/renderer/src/apps/chat-main/ChatTabView.vue` | 路由初始化用 live `sessionStore.activeSessionId` | skills use | 中 | 勿用缓存 bootstrap.activeSessionId，否则技能「使用」会回到旧会话 |
| H56 | `src/main/desktop/window/index.ts` `jiaorongPrivateApiCors.ts` 浮窗 | 主窗口/设置窗/浮窗暂 `webSecurity: false`；CORS helper 仍只给当前 mode 私有 API origin 补头 | auth+skills+kb | 高 | 技能 zip、知识库 iframe/列表跨域时暂关隔离。XSS 可打任意源和 `file://`。后端注解不全时不要开 true |
| H57 | `src/renderer/src/assets/logo.png` `logo-dark.png` / `resources/icon.png` | 交融 logo 覆盖 DeepChat 图标 | brand | 低 | Agent 欢迎页、头像、Dock、Splash `loading.vue` |
| H58 | `src/main/config/jsonStoreRecovery.ts` | 损坏 JSON store 隔离恢复 | config | 中 | `app-settings` / `mcp-settings` 构造前 quarantine |
| H59 | `src/main/mcp/settings.ts` + `composition.ts` | 默认开启 MCP（一次性迁移 `mcpEnabledDefaultV3`） | mcp | 中 | 与设置拨到 ON 等效 |
| H60 | `src/main/onboarding/autoCompletePreconfiguredOnboarding.ts` | 预配 Provider 则自动 complete 引导 | onboarding | 中 | `composition.init` 在 getProviders 之后调用 |
| H61 | `resources/skills/jiaorong-settings/` | 交融设置技能（中文 displayName） | skills | 中 | 工具名 `jiaorong_settings_*`；兼容 deepchat-settings 别名 |
| H62 | `ChatMainApp.vue` / `ChatTabView.vue` / `lib/shellBootstrap.ts` | 壳启动幂等水合 | startup | 中 | 技能/KB 独占路由会卸掉 ChatTabView，agents 必须在壳上灌 |
| H63 | `WindowSideBar.vue` / `src/shared/sidebarAgents.ts` | 侧栏 Agent 分区 | sidebar | 低 | deepchat → 技能/KB → 用户 Agent；勿改 enabledAgents 过滤 |
| H64 | `slashMenuDisplayText` 调用点 + `tools.displayCatalog` + `SkillsPanel.vue` | 工具/技能中文展示 | skills | 中 | 读 metadata.displayName / function.displayName；缺省走 H117 静态对照表 |
| H65 | `scripts/afterPack.js` Linux launcher 名 | 用 packager.executableName | pack | 中 | 协议已在 yml；不要整文件覆盖 afterPack |
| H66 | 内置 `resources/skills/*/SKILL.md` | 仅补 YAML `metadata.displayName` | skills | 低 | 不覆盖上游技能正文 |
| H67 | `ChatStatusBar.vue` | 非管理员只藏模型选择（`speLabel`）；主动协作留在外面 | admin | 中 | 白名单空则看不见切换模型；DOM 仍在，width:0 + opacity:0；主动协作可点 |
| H68 | `MessageItemAssistant.vue` | 气泡固定 `ModelIcon model-id=duihua` + 名称「交融对话」 | brand | 中 | 按 master，不要改成 AgentAvatar |
| H69 | `settingsNavigation.ts` / `settings/App.vue` | 侧栏用 `getSettingsSidebarNavigationGroups`；找不到路由 fallback `/deepchat-agents` | config | 中 | MCP 等仍进 DOM，再靠白名单 CSS `hidden` |
| H70 | `chatSettingsTools` server.name | `jiaorong-settings`（兼容 `deepchat-settings`） | skills | 中 | McpIndicator / permission 双名 |
| H71 | `src/main/provider/defaults.ts` | 内置 `jiaorong` Provider 置顶，`enable: true` | provider | 高 | apiKey 密封/解开在 `@jiaorong/provider/builtinSecret`；源码存 `jrk1` 串，主进程 reveal 后再进 store；缺 id 会由 settings 合并进已有 store |
| H72 | `src/main/provider/baseProvider.ts` | 无已启用模型时自动 enable `jiaorong-deepseek-v4-pro`；fallback `X-Title` 用 `HTTP_X_TITLE` | provider | 中 | 按 master `defaultEnabledModels` |
| H73 | `resources/linux_tray.png` `macTrayTemplate.png` `win_tray.ico` | 交融托盘图标 | brand | 低 | 从 `backup/master-before-2026-08-14` 检出 |
| H74 | 托盘/窗标题/导出文件名/同步目录/搜索 mime/MCP 客户端名/ACP 临时目录/远程控制英文/Copilot UA | DeepChat→JiaorongAI | brand | 中 | 协议/类型名（`source: 'DeepChat'`、`io.deepchat`）不改；discussions 仍 ThinkInAIXYZ |
| H75 | `skill/settings.ts` `skill/index.ts` `sessionPaths.ts` | 默认路径 `.jiaorongchat`；portable 修复走 `appIdentity` | skills | 中 | 实体 `@jiaorong/brand/appIdentity`；`src/shared/appIdentity.ts` re-export；兼容旧 `.deepchat` |
| H76 | `settingsSidebarAdmin.ts` | `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 含 `settings-debug` / `settings-ocr` | config | 中 | 上游 debug 仅 dev 出现；非管理员侧栏 `hidden`；记忆页不藏 |
| H77 | 内置 `resources/skills/*/SKILL.md` | 按 master 写入 YAML `description` 中文 | skills | 低 | 只改 description，不覆盖英文正文；列表卡/详情 hero 读此字段 |
| H78 | `zh-CN` chat/settings/welcome/routes/mcp | 补 zh-CN 未译壳文案（工具/设置总览/通用智能体等） | i18n | 低 | 调用名仍英文；缺 displayName 时走 H117 静态对照表 |
| H79 | `mcp/inMemoryServers/appleServer.ts` `artifactsServer.ts` | 按 master 写入工具中文 `title`/`description` | mcp | 中 | 斜杠菜单读 annotations.title；函数 name 仍英文 |
| H80 | `agentToolManager.ts` 技能四件套 | 按 master 写入中文 `description`（displayName 已有） | skills | 中 | 斜杠菜单描述读 function.description；函数 name 仍英文 |
| H81 | `chatSettingsTools.ts` | 按 master 写入五条中文 description + `JiaorongAI settings control` | skills | 中 | schema/失败文案 DeepChat→JiaorongAI 同步 master |
| H82 | `agentTapeTools` `tool/index.ts` `agentImageGenerationTool` `liveDelegationTool` `agentMemoryTools` `cronJobTool` | 用户/模型可见 DeepChat→JiaorongAI | brand | 低 | 不改协议字段 `source: 'DeepChat'`；tape 工具 API 保持上游 search/context，只换品牌词 |
| H83 | `splashWindow.ts` `splash/loading.vue` `skill/index.ts` Runtime Context / Skills README | 启动页与技能同步目录按 master 品牌 | brand | 低 | 标题/hint `JiaorongAI`；Splash 圆底用电蓝/青，中间图用 H57 PNG |
| H84 | `systemPromptBuilder.ts` 验证段 | `In the JiaorongAI repository` 以便 hostPromptLocalize 命中 | prompts | 低 | 包名检测仍走 format/i18n/lint 脚本启发式 |
| H85 | `deepChatLoopRunner.ts` `contextCoordinator.ts` | 上下文溢出用户可见文案 DeepChat→JiaorongAI | brand | 低 | 类型错误里的 DeepChat Agent/session 不改；CLI 所有权标记不改 |
| H86 | `McpAppView.vue` `liveDelegationService.ts` `toolPermissionReviewer.ts` | MCP App host / 委托交接 / 自动批准审阅品牌词 → `APP_NAME` | brand | 低 | 与 MCP 客户端 `{ name: 'JiaorongAI' }` 一致；不改 `source: 'DeepChat'`、CLI `DeepChat CLI` |
| H87 | `mainProcess.ts` `startupDeepLink.ts` 技能临时目录 / 压缩文案 / notarize / afterPack / CUA·飞书插件身份 | Win AppUserModelId、deeplink env、临时目录前缀、CUA `hostBundleId`+helper 显示名与 `appId`/`productName` 对齐 | brand | 中 | 可执行文件仍 `deepchat-cua-driver`；不整文件覆盖 CUA vendor Swift；`source: 'DeepChat'` / `io.deepchat` 不改 |
| H88 | `lifecycleGate.ts` `skill/index.ts` `skillTools.ts` `sessionDataMigrations.ts` `skillSync.ts` README/CONTRIBUTING `.env.example` | 用户可见 Agent 错误文案 + 仓库身份块 + env 注释 | brand | 低 | README 徽章仍指向 ThinkInAIXYZ/deepchat；CLI / Programmatic Tool / 类型错误里的 DeepChat Agent 不改 |
| H89 | `scripts/ci/package-manifest.mjs` macOS/Win CI 与 e2e 产物路径 | 打包/冒烟按 `productName`/`executableName` 认 `JiaorongAI.app` / `JiaorongAI.exe` | ci | 中 | 不搬 Gitee 流水线 |
| H90 | `electron.vite.config.ts` `assignmentPolicy.ts` `.gitignore` `build/generate-version-files.mjs` | 补回 less 预处理；会话迁移错误文案；忽略 `.jiaorongchat/`；版本文件下载名 `JiaorongAI-*` | brand | 低 | 不改 notarization keychainProfile `DeepChat`（本机凭证名）；artifact 夹具里的 `DeepChat-*` 文件名仍是测试构造 |
| H91 | `electron-builder.yml` `dev-app-update.yml` `src/main/upgrade/index.ts` | 自动更新走 generic `https://c4ai.ccccltd.cn/xkprosdk/` channel `jrsi`；产物名去掉 version 段以对齐现网 `JiaorongAI-windows-x64.exe` | ci | 高 | 关于页渠道选择已按 master 隐藏；检查时强制 `jrsi`；包版本以 master `0.7.0` 为准；现网 jrsi 仍为 0.6.0 时检查会显示已是最新 |
| H92 | `AppBar.vue` `conversationTiming/installMain.ts` | 登录页隐藏升级按钮；耗时日志补 Agent 名/会话标题与 hook `agentId` | logging | 低 | 不恢复管理员白名单号码 |
| H93 | `src/main/tool/index.ts` `shouldBrokerMcpTool` | 仅 `jiaorong-knowledge-base` 跳过 ToolPermissionBroker | knowledgeBase | 中 | 等价旧产品该 server `autoApprove: ['all']`；不恢复 MCP 级 autoApprove；filesystem/bocha/brave 等其它 MCP 仍确认 |
| H94 | `AgentWelcomePage.vue` `AboutUsSettings.vue` | 欢迎页 Agent 卡按侧栏分区（内置 deepchat 置顶 + 最多 8 个用户 Agent）；关于页隐藏更新渠道与 GitHub/官网下载 | brand | 中 | 检查更新仍强制 jrsi；不恢复管理员白名单号码；不恢复 DeepChat discussions 外链 |
| H95 | `NewThreadPage.vue` `ChatInputBox.vue` `ChatInputToolbar.vue` | 新会话知识库选中固定草稿 key（`null` → `__new_thread__`），不跟 ACP draft sessionId | knowledgeBase | 中 | 发送仍 `prepareKnowledgeBaseSendFiles(null)`；已有会话页不传 override，继续用真实 sessionId |
| H96 | `src/main/mcp/index.ts` `isPluginOwnedServerConfig` | `jiaorong-knowledge-base` 不当插件闸门 | knowledgeBase | 高 | 旧产品用 `source:plugin` 元数据；上游无真实 jiaorong 插件时 start/update 会失败。按 server 名走普通 HTTP MCP 启停 |
| H97 | `src/main/agent/deepchat/runtime/contextBuilder.ts` | 知识库合成附件始终内联 content | knowledgeBase | 高 | 上游默认 `includeFileContent:false`（`[omitted; use read]`）；`jiaorong-kb://context` 不是真实路径，必须把强制检索说明塞进 prompt |
| H98 | `tapeEntryStore.ensureBootstrapAnchor` `factService.getTapeIncarnationId` `sessionDataMigrations` `composition.ts` | 旧会话补 Tape `tapeIncarnationId` | tape | 高 | DeepChat 给 `session/start` 加了 incarnation 字段；缺字段会报 Session Tape bootstrap is missing。启动回填 + 发送路径自愈 |
| H99 | `systemEnvPromptBuilder.ts` | 环境段模型名写死 `Jiaorong-Ai` | prompts | 中 | 按 master：不把真实 provider/modelId 塞进 system env；与默认提示「禁止体现具体型号」一致 |
| H100 | `skill/index.ts` `agentSkillImportService.ts` | sidecar 目录 `.jiaorongchat-meta` | skills | 中 | 按 master 写新 sidecar；扫描/迁移仍认上游 `.deepchat-meta`，避免当技能目录或丢掉旧扩展配置 |
| H101 | `skill/sync/*` `acpCapabilities.ts` `agentToolManager.ts` | 新分层技能同步/ACP/设置工具注释与失败日志 DeepChat→JiaorongAI | brand | 低 | H88 旧路径 `skillSyncPresenter` 已拆到 `skill/sync`；`mapDeepChatTools`/`toDeepChatJsonSchema`/CLI/类型错误不改 |
| H102 | `src/main/appMain.ts` | 单实例锁失败日志 `Another JiaorongAI instance is already running` | brand | 低 | 按 master：拿不到锁时先打日志再 quit；不改锁逻辑 |
| H103 | `scripts/afterPack.js` | Linux 启动包装脚本首次运行注册 `jiaorongchat://` 与 `deepchat://` | brand | 中 | desktop MimeType + xdg-mime 双协议；保留 FFF/OCR/VSS 与 `LINUX_APP_NAME` 回退 |
| H104 | `resources/skills/skill-creator/scripts/init_skill.py` `SKILL.md` | 新技能强制写到 `~/.jiaorongchat/skills` | skills | 低 | 环境变量 `SKILLS_DIR`/`JIAORONG_SKILLS_DIR`/`DEEPCHAT_SKILLS_DIR`；自定义 `--path` 忽略 |
| H105 | `skillExecutionService.ts` `agentToolManager.ts` | 技能脚本环境注入 `SKILLS_DIR`/`JIAORONG_SKILLS_DIR`/`DEEPCHAT_SKILLS_DIR` | skills | 低 | 按 master：与 `init_skill.py` 默认目录对齐；`SKILL_ROOT`/`DEEPCHAT_SKILL_ROOT` 仍指向 package root |
| H106 | `src/main/skill/index.ts` | 配置里的 `~/.deepchat/skills` 修到 `~/.jiaorongchat/skills` | skills | 中 | 按 master 调用 `repairLegacySkillsPath` + `getDefaultSkillsPath`；便携路径修复仍走 `repairPortableDefaultSkillsPath` |
| H107 | `src/main/skill/settings.ts` | `getPath()` 按 master `getSkillsPath` 修复并写回 `skillsPath` | skills | 中 | 仅 `repairLegacySkillsPath`；工具层 `skillSettings.getPath()` 失败回退不再读到 `~/.deepchat/skills`；便携修复仍在 `SkillService.resolveSkillsDir` |
| H108 | `src/main/agent/shared/storage/sessionPaths.ts` | 会话根目录走 `appIdentity.getSessionsRoot()` | brand | 中 | 实体 `@jiaorong/brand/appIdentity`；访问会话路径时 `migrateLegacyAppHomeDir`，`~/.deepchat` 整目录迁到 `~/.jiaorongchat` |
| H109 | `NewThreadPage.vue` `modelIconRegistry.ts` `ChatStatusBar.vue` | 项目选择器外边距；Jiaorong 模型图标；非管理员隐藏模型参数 | admin+brand | 中 | `mb-6` 包在 Dropdown 外；`jiaorong` / `openai-completions` → `duihua.png`；触发器图标 `shrink-0`；高级配置「模型设置」仅管理员 |
| H110 | `NewThreadPage.vue` `ChatInputBox.vue` | 技能中心「创建技能」预填文案且带入 `skill-creator` 芯片 | skills | 中 | 芯片在首行，文案换行在下；芯片插入不可把 prompt 冲成空 |
| H111 | `ChatInputBox.vue` `KnowledgeBaseSelectionChips.vue/.less` | 输入框知识库回显区恢复 max-height + 超出滚动 | knowledgeBase | 低 | 对齐 master `.chat-input-attachments`：`max-height: min(11.25rem, 25vh)`、`overflow-y: auto`；无选中不占位 |
| H112 | `ModelIcon.vue` | 模型选择 logo 按 master 直接画在 img 上 | brand | 中 | 不要 skeleton/`opacity-0` 等 @load；不要 span 包百分比 img；`w-3.5 h-3.5` 打在 img 上 |
| H113 | `ModelIcon.vue` `ChatStatusBar.vue` `style.css` `WindowSideBar.vue` | 模型 logo 不被 preflight 压成 0；Tailwind 扫描 jiaorong_src；技能/KB 页不挂会话列和收起钮 | brand | 中 | `img { max-width:100% }` 在 flex 里会把 logo 塌掉，用 `.model-icon-img { max-width:none }`；底栏触发器改回 providerId（H118）；独占路由对齐 master `isSkillsRoute` |
| H114 | `resources/skills/jiaorong-cli` `skill/index.ts` `memory-management` | 删除重复 deepchat-settings；CLI 技能 id 为 `jiaorong-cli`（别名 `deepchat-cli`） | skills | 中 | 别名 `deepchat-settings`→`jiaorong-settings`、`deepchat-cli`→`jiaorong-cli`；用户目录残留会删掉；技能正文用 `jiaorong`；模块仍 `deepchat.mjs`；PATH 安装器仍 `deepchat` |
| H115 | `src/main/agent/deepchat/runtime/dispatch.ts` | 旧网页检索卡片兼容 `application/deepchat-webpage` | search | 低 | 新结果仍写 `jiaorong-webpage`；历史工具结果 mime 按 master 双认 |
| H116 | `.github/workflows/build.yml` `build-test.yml` | 手动构建直出 `JiaorongAI-*` 安装包（对齐 master） | ci | 中 | 上传 `dist/*`；mac 不强制公证。PR Package Check 仍用上游 `_package-*` verification，不整文件覆盖 |
| H117 | `src/renderer/src/lib/slashMenuDisplayText.ts` + `jiaorong_src/tools/*` | 斜杠菜单中文展示 | skills | 中 | 实体 `@jiaorong/tools/slashMenuDisplayText`；宿主 re-export；静态表 `toolDisplayNames.ts`；runtime displayName 优先 |
| H118 | `ChatStatusBar.vue` `ModelIcon.vue` | 底栏模型列表/触发器渲染各服务商 logo | brand | 中 | 必须 `import ModelIcon`；漏 import 时 Vue 当未知标签，所有服务商图标都空白。传 `providerId`；尺寸打在 img 上 |
| H119 | `mentions/utils.ts` | 斜杠选工具插入 `@中文展示名 ` | skills | 中 | 列表 label 与输入框一致；函数 name 仍英文，发送仍 `editor.getText()` |
| H120 | `SkillChipView.vue` `SessionSkillsIndicator.vue` | 技能芯片/指示器中文名 | skills | 低 | `getSkillDisplayLabel`；remove 仍用英文 skillName |
| H121 | `ChatPage.vue` `MarkdownRenderer.vue` `MessageBlockThink.vue` `ThinkContent.vue` `useChatScrollController.ts` | 聊天列表关闭 markdown 虚拟化；已结束消息关闭 batch-rendering；思考块首屏收起；上滑不交还跟随 | chat | 中 | 虚拟化的 viewport-priority 滚近才换真高度，会钳回底部。流式仍批量。不要用列表 min-height 锁高度 |
| H122 | `src/main/skill/index.ts` | 手删技能目录后踢掉过期缓存 | skills | 中 | `getAllSkills`/`getMetadataList`/`readSkillFile` 核对物理路径；watcher 认技能根目录 delete，不只认 SKILL.md |
| H123 | `NewThreadPage.vue` | 未选项目时触发器显示「聊天」 | brand | 低 | `selectionSource === 'none'` 不再用 `common.project.select`；内置工作区仍靠 `defaultChatWorkspacePath` 标成聊天 |
| H124 | `defaultSystemPrompt.ts` `hostPromptLocalize.ts` `contextBuilder.ts` `skillContextMaterializer.ts` `systemPromptBuilder.ts` | 思考语言只跟用户亲手输入；技能/MCP/检查点不是判定源 | prompts | 高 | 上游把技能/检查点贴进 `role=user`；尾注排除这些材料；本轮技能头中文；用户正文前插语言分隔；ACP 也 finalize |
| H125 | `src/main/skill/index.ts` | 新建 DeepChat Agent 默认绑定目录里全部技能 | skills | 中 | 缺 binding → `assigned: true`，不看开关；已有 `assigned: false` 不覆盖；`getAllSkills` 会给现有 Agent 补缺 |
| H126 | `PluginsHubPage.vue` | 插件 Hub 技能 Tab 进交融 `/skills` | skills | 低 | `name: 'skills'`；上游 `plugins-skills` 路由仍保留 |
| H127 | `src/renderer/src/stores/ui/spotlight.ts` | 非管理员搜索不出现侧栏已隐藏的设置项 | admin | 低 | 与 `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 同一名单；动作须带 `routeName` |
| H128 | `resources/skills/*/SKILL.md` `scripts/build-cli.mjs` `agentCommandAccess.ts` `electron-builder.yml` | 内置技能描述去 DeepChat；CLI 技能示例用 `jiaorong` | skills | 低 | YAML 描述 Claude/claude.ai→交融AI；bundled 增加 `jiaorong` 启动器，仍调 `deepchat.mjs`；安装包 extraResources 必须带上 |
| H129 | `src/cli/discovery.ts` | CLI 默认 userData 跟 `JiaorongAI` | cli | 中 | 原先找 `Application Support/DeepChat`，应用写在 `JiaorongAI`；优先 `JIAORONG_CLI_USER_DATA_DIR`，其次 `DEEPCHAT_E2E_USER_DATA_DIR` |
| H130 | `agentCommandAccess.ts` `composition.ts` `localControl.ts` | 智能体 CLI 注入真实 userData | cli | 中 | 同时写 `JIAORONG_CLI_USER_DATA_DIR` 与 E2E 变量，兼容未重建的旧 `deepchat.mjs` |
| H131 | `src/cli/{args,format,run,transport,artifacts,brand}.ts` | CLI 用户可见文案 DeepChat→JiaorongAI | cli | 低 | 帮助/用法用 `jiaorong`；协议头 `x-deepchat-*` 与 env 名不改 |
| H132 | `message.ts` `ChatPage.vue` `chatScrollState.ts` `useListGestures.ts` | 引用 `@jiaorong/chat/messageWindowPolicy`；restore 下限 1；距顶静默预取 | chat | 中 | 数字在私有目录：首屏 10、上滑 20、距顶预取 px。同会话刷新 `max(已有, 10)`。进入预取区立即加载；同一 wheel 手势不取消 history-prepend；加载锁包住补偿空窗 |
| H133 | `MemorySettings.vue` `MemoryConfigInlinePanel.vue` | 记忆页工具栏提长期记忆开关；藏配置按钮与诊断 Tab | settings | 低 | 开关 `@jiaorong/config/memorySettingsChrome`。`DcButton` 不能 `v-show`（根是 TooltipProvider）；配置按钮用 `v-if` |
| H134 | `mcp/settings.ts` `conversationSearchServer.ts` | 默认 MCP 清单改引用 `@jiaorong/mcp/defaultEnabledServers`；对话搜索工具中文 title | mcp | 中 | 新装含知识库+对话搜索；已有安装 `jiaorongMcpDefaultAddonsV1` 只打开对话搜索 |
| H135 | `WindowSideBar.vue` `settingsSidebarAdmin.ts` | 主侧栏「插件」仅管理员可见 | admin | 低 | 名单 `MAIN_SIDEBAR_ADMIN_ONLY_ROUTES`；非管理员 `v-if` 不渲染按钮 |
| H136 | `router/index.ts` `McpIndicator.vue` | 非管理员进 `/plugins*` 回聊天；工具面板不显示打开插件页的齿轮 | admin | 低 | `beforeEnter` 用 `isMainSidebarItemHidden('plugins')`；齿轮同一判断 |
| H137 | `src/main/desktop/window/index.ts` `tab.ts` `src/main/app/composition.ts` `src/main/deeplink/navigation.ts` `src/main/deeplink/actions.ts` `src/shared/types/desktop.ts` `src/shared/externalUrl.ts` | 扫码 iframe 302 在**每个** WebContents 拦截（Win/Mac/Linux iframe 都不走 OS 协议）；Tab `window.open` 同样拦截；`jiaorongchat:` 允许作为系统协议兜底 | auth | 高 | HTTPS 中间跳转不拦截；iframe 不把 mcp/start 当登录；同 token 2s 内去重（Windows 可能拦截+second-instance 各一次） |
| H138 | `.github/workflows/build.yml` `build-test.yml` `electron-builder.yml` `scripts/sign-cua-helper.mjs` | Linux 补 `installRuntime`；Mac x64 用 `macos-15-intel`；Windows matrix `fail-fast: false`；artifact 名 `JiaorongAI-windows-${arch}`；Mac 手动包 CUA 用 `distribution` + `CUA_ALLOW_SIGNED_WITHOUT_NOTARIZATION`，CSC 签主程序和 helper，保留 `signIgnore`，不公证 | ci | 高 | 不改上游 `_package-*.yml` / Release 的 `deepchat-package-*`；不打开 `build_for_release`；不要 `signIgnore=[]` 重签 helper；不要设 `CSC_IDENTITY_AUTO_DISCOVERY=false`（会让主程序签不上，Chrome 下载仍报已损坏） |
| H139 | `build/icon.png` `icon.ico` `icon.icns` `dmg-background.png` `dmg-background@2x.png` | 安装包/系统图标与 DMG 背景换成交融 logo | brand | 中 | electron-builder `buildResources` 用 `build/icon.*`，不是已经换成交融的 `resources/icon.png`；DMG 白框是 Finder 叠图标的占位 |

## 下次合上游：值得抽到 `jiaorong_src` 的宿主文件

530 份「改上游」里大半是 i18n / 品牌词 / 图标 / yml，整文件搬不走。真正会反复撞车的是 Jiaorong 业务模块躺在开源路径里。样板：宿主留 `export *`。

### 已迁出（宿主 re-export）

| 宿主路径 | 实体 | 备注 |
|----------|------|------|
| `src/shared/legacyBrandAliases.ts` | `@jiaorong/brand/legacyBrandAliases` | 未进 `brand/index.ts` 桶 |
| `src/shared/appIdentity.ts` | `@jiaorong/brand/appIdentity` | 含 fs；**禁止**从 `brand/index.ts` 导出 |
| `src/renderer/src/lib/slashMenuDisplayText.ts` | `@jiaorong/tools/slashMenuDisplayText` | 未与 `toolDisplayNames.ts` 合并 |
| （无整文件 re-export） | `@jiaorong/chat/messageWindowPolicy` | 首屏/分页/预取像素；`message.ts` `ChatPage.vue` 直接引用 |

### 不搬

- `jiaorongPrivateApiCors.ts`：上游无此文件，冲突在 `window/index.ts` 的 import；再搬会把 `electron` 带进 `jiaorong_src`（要 nocheck）
- `ChatStatusBar.vue` 等整页 / `skill/index.ts` 整 Presenter：只抽 helper
- i18n、logo、yml、CI、`ChatPage` 滚动（H121）、`defaults.ts` 默认表（密钥密封逻辑已在 `@jiaorong/provider/builtinSecret`）
- `jsonStoreRecovery.ts`、`modelConfigDefaults.ts`：偏通用，更适合回上游

### 以后仍可只抽 helper

- `contextBuilder.ts`（知识库内联 content、用户正文前语言分隔）、`tapeEntryStore.ts`（incarnation 回填）、`systemPromptBuilder.ts`（`finalizeJiaorongSystemPrompt`）

