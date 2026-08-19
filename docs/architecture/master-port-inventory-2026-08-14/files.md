# master 全量改动文件记录（980）

对照：`ce56c797a`（init，2026-06-15）→ `backup/master-before-2026-08-14` @ `d978929`（feat: 添加管理员）。

`git diff --name-only` 共 **980** 个路径（A 412 / M 564 / D 2 / R 2）。

当前工作区（含未提交搬迁）用「同路径或 presenter→新分层映射」判断文件是否还在。**路径在不等于交融改动已搬完**，产品文案必须再对内容。

「当前树缺失」里大量是旧 `src/main/presenter/*` 路径；上游已拆到 `src/main/mcp`、`src/main/tool`、`src/main/agent` 等，应按**新路径对内容**，不要整文件覆盖。

## 排查进度（按本表逐项）

- [x] `D-inmemory_mcp`（4）：对照 master 工具 `title`/`description`。已补 Apple 七件套中文名+描述、Artifacts「获取工件说明」。博查/Brave/对话搜索 title 在 master 也是英文，保持原样。知识库远端工具 `knowledge_base_retrieve` 走静态对照表显示「知识库检索」（H117）。autoPrompting / deepResearch 的中文 description 当前已有。
- [x] `H-builtin_skills`（15）：YAML `displayName` + `description` 已按 master 中文写入；SKILL.md 正文仍英文。
- [x] `A-jiaorong_src`（141）：整包已在工作区。
- [x] `C-renderer` + `E-main` + `G-shared`（交融改动需核，约 305）：路径与 `git diff` 980 条对齐无漏记。产品接线含 H119/H120；底栏必须 `import ModelIcon`（H118），漏 import 时所有服务商 logo 都不画。其余 HOST 文件继续按冒烟核。
- [ ] `B-i18n`（196）：zh-CN 壳文案已补一批；其它 locale 不要求译成中文。
- [ ] `J-test_jiaorong` / `K-test`：按改动补回归，不扩写耦合测试。
- [x] `L-docs` / `N-agents_sdd`：`jiaorong-sdd` / `jiaorong-sdd-zh` 已从 master 拷入；其余 DeepChat 架构/issue 文档可后搬。
- [ ] `M-ci`：产物身份已按 `JiaorongAI.app` / `JiaorongAI.exe` 对齐；publish 已接 generic `https://c4ai.ccccltd.cn/xkprosdk/` channel `jrsi`；测试服打包 `build-test.yml` 已接（H116）；不盲拷 Gitee 流水线。

## 结论摘要

| 判定 | 数量 |
|------|------|
| 路径已对上（交融改动需核） | 305 |
| 文档可后搬 | 270 |
| 整包已在工作区 | 141 |
| 当前树缺失 | 98 |
| 路径已对上 | 80 |
| jiaorong 测试已在 | 24 |
| 上游插件，不整文件覆盖 | 22 |
| 内置技能已在（内容需核） | 15 |
| SDD文档可后搬 | 13 |
| CI按现网重接 | 6 |
| 路径已对上（中文需核） | 4 |
| master已删 | 2 |

## 按目录桶

| 桶 | 数量 |
|----|------|
| A-jiaorong_src | 141 |
| B-i18n | 196 |
| C-renderer | 61 |
| D-inmemory_mcp | 4 |
| E-main | 73 |
| G-shared | 16 |
| H-builtin_skills | 15 |
| I-resources | 6 |
| J-test_jiaorong | 25 |
| K-test | 102 |
| L-docs | 270 |
| M-ci | 6 |
| N-agents_sdd | 14 |
| O-scripts | 4 |
| P-other | 47 |

## 优先核内容（用户可见 / 运行时）

下列桶必须按 master 内容逐文件对，不能只看路径在不在：

- `D-inmemory_mcp`：工具 `title` / `description`（截图里的 Apple 邮件/地图等）
- `H-builtin_skills`：YAML `description` / `displayName`
- `B-i18n`：以 zh-CN 为准
- `C-renderer` `E-main` `G-shared`：HOST 触点与品牌/管理员/路径
- `A-jiaorong_src`：整包应已在；缺文件即漏搬

## 当前树缺失（非文档/CI/测试）

| master 路径 | 桶 |
|-------------|----|
| `src/main/lib/agentRuntime/backgroundExecSessionManager.ts` | E-main |
| `src/main/lib/agentRuntime/questionTool.ts` | E-main |
| `src/main/lib/agentRuntime/shellEnvHelper.ts` | E-main |
| `src/main/presenter/agentRepository/index.ts` | E-main |
| `src/main/presenter/agentRuntimePresenter/dispatch.ts` | E-main |
| `src/main/presenter/agentRuntimePresenter/index.ts` | E-main |
| `src/main/presenter/agentSessionPresenter/index.ts` | E-main |
| `src/main/presenter/configPresenter/acpLaunchSpecService.ts` | E-main |
| `src/main/presenter/configPresenter/index.ts` | E-main |
| `src/main/presenter/configPresenter/modelConfig.ts` | E-main |
| `src/main/presenter/exporter/formats/conversationExporter.ts` | E-main |
| `src/main/presenter/exporter/formats/nowledgeMemExporter.ts` | E-main |
| `src/main/presenter/filePresenter/FilePresenter.ts` | E-main |
| `src/main/presenter/githubCopilotDeviceFlow.ts` | E-main |
| `src/main/presenter/githubCopilotOAuth.ts` | E-main |
| `src/main/presenter/index.ts` | E-main |
| `src/main/presenter/lifecyclePresenter/SplashWindowManager.ts` | E-main |
| `src/main/presenter/llmProviderPresenter/acp/acpCapabilities.ts` | E-main |
| `src/main/presenter/llmProviderPresenter/acp/acpProcessManager.ts` | E-main |
| `src/main/presenter/llmProviderPresenter/acp/acpTerminalManager.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/discordAuthGuard.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/discordCommandRouter.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/feishuAuthGuard.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/feishuCommandRouter.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/qqbotAuthGuard.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/qqbotCommandRouter.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/remoteAuthGuard.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/remoteCommandRouter.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/remoteConversationRunner.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/weixinIlinkAuthGuard.ts` | E-main |
| `src/main/presenter/remoteControlPresenter/services/weixinIlinkCommandRouter.ts` | E-main |
| `src/main/presenter/skillSyncPresenter/adapters/copilotAdapter.ts` | E-main |
| `src/main/presenter/skillSyncPresenter/formatConverter.ts` | E-main |
| `src/main/presenter/skillSyncPresenter/index.ts` | E-main |
| `src/renderer/src/composables/usePageCapture.example.ts` | C-renderer |
| `src/renderer/src/pages/ChatPage.vue` | C-renderer |
| `src/renderer/src/views/ChatTabView.vue` | C-renderer |
| `src/shared/types/presenters/legacy.presenters.d.ts` | G-shared |
| `src/shared/types/presenters/tool.presenter.d.ts` | G-shared |
| `test/renderer/jiaorong/skills/mockSkills.test.ts` | J-test_jiaorong |

## D-inmemory_mcp 逐文件

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `src/main/presenter/mcpPresenter/inMemoryServers/appleServer.ts` | `src/main/mcp/inMemoryServers/appleServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/artifactsServer.ts` | `src/main/mcp/inMemoryServers/artifactsServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/bochaSearchServer.ts` | `src/main/mcp/inMemoryServers/bochaSearchServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/braveSearchServer.ts` | `src/main/mcp/inMemoryServers/braveSearchServer.ts` | 路径已对上（中文需核） |

## 全量 980 文件


### A-jiaorong_src

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| A | `src/jiaorong_src/HOST_TOUCHPOINTS.md` | `src/jiaorong_src/HOST_TOUCHPOINTS.md` | 整包已在工作区 |
| A | `src/jiaorong_src/README.md` | `src/jiaorong_src/README.md` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/config.ts` | `src/jiaorong_src/api/auth/config.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/index.ts` | `src/jiaorong_src/api/auth/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/interceptors/debounce-request.ts` | `src/jiaorong_src/api/auth/interceptors/debounce-request.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/interceptors/index.ts` | `src/jiaorong_src/api/auth/interceptors/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/interceptors/rules.ts` | `src/jiaorong_src/api/auth/interceptors/rules.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/loginApi.ts` | `src/jiaorong_src/api/auth/loginApi.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/loginService.ts` | `src/jiaorong_src/api/auth/loginService.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/types.ts` | `src/jiaorong_src/api/auth/types.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/utils/is.ts` | `src/jiaorong_src/api/auth/utils/is.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/utils/local.ts` | `src/jiaorong_src/api/auth/utils/local.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/utils/pwd.ts` | `src/jiaorong_src/api/auth/utils/pwd.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/auth/utils/sm4.ts` | `src/jiaorong_src/api/auth/utils/sm4.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/index.ts` | `src/jiaorong_src/api/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/config.ts` | `src/jiaorong_src/api/knowledgeBase/config.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/index.ts` | `src/jiaorong_src/api/knowledgeBase/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/mcpConfig.ts` | `src/jiaorong_src/api/knowledgeBase/mcpConfig.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/mcpTypes.ts` | `src/jiaorong_src/api/knowledgeBase/mcpTypes.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/toMcpSelections.ts` | `src/jiaorong_src/api/knowledgeBase/toMcpSelections.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/knowledgeBase/types.ts` | `src/jiaorong_src/api/knowledgeBase/types.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/api/skills/index.ts` | `src/jiaorong_src/api/skills/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/book.png` | `src/jiaorong_src/assets/book.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-excel.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-excel.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-folder.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-folder.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-pdf.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-pdf.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-ppt.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-ppt.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-txt.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-txt.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/kb-file-icons/icon-document-word.png` | `src/jiaorong_src/assets/kb-file-icons/icon-document-word.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/knowledge.png` | `src/jiaorong_src/assets/knowledge.png` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/knowledgeBase.svg` | `src/jiaorong_src/assets/knowledgeBase.svg` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/skill-market-menu.svg` | `src/jiaorong_src/assets/skill-market-menu.svg` | 整包已在工作区 |
| A | `src/jiaorong_src/assets/skill.png` | `src/jiaorong_src/assets/skill.png` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/assets/bg.png` | `src/jiaorong_src/auth/assets/bg.png` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/assets/electron/electron-login1.png` | `src/jiaorong_src/auth/assets/electron/electron-login1.png` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/assets/not-code.png` | `src/jiaorong_src/auth/assets/not-code.png` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/components/CodeLogin.vue` | `src/jiaorong_src/auth/components/CodeLogin.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/components/UserCompact.vue` | `src/jiaorong_src/auth/components/UserCompact.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/composables/useLoginPageScale.ts` | `src/jiaorong_src/auth/composables/useLoginPageScale.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/host.ts` | `src/jiaorong_src/auth/host.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/index.ts` | `src/jiaorong_src/auth/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/auth-deeplink.ts` | `src/jiaorong_src/auth/lib/auth-deeplink.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/auth-from-url.ts` | `src/jiaorong_src/auth/lib/auth-from-url.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/bootstrap-before.ts` | `src/jiaorong_src/auth/lib/bootstrap-before.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/ensureSm4.ts` | `src/jiaorong_src/auth/lib/ensureSm4.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/guard.ts` | `src/jiaorong_src/auth/lib/guard.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/local-user.ts` | `src/jiaorong_src/auth/lib/local-user.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/session.ts` | `src/jiaorong_src/auth/lib/session.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/lib/setup.ts` | `src/jiaorong_src/auth/lib/setup.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/module.ts` | `src/jiaorong_src/auth/module.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/pages/LoginPage/LoginPage.vue` | `src/jiaorong_src/auth/pages/LoginPage/LoginPage.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/pages/LoginPage/login.less` | `src/jiaorong_src/auth/pages/LoginPage/login.less` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/vendor/sm4/byte-string.js` | `src/jiaorong_src/auth/vendor/sm4/byte-string.js` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/vendor/sm4/s4.js` | `src/jiaorong_src/auth/vendor/sm4/s4.js` | 整包已在工作区 |
| A | `src/jiaorong_src/auth/vendor/sm4/smutils.js` | `src/jiaorong_src/auth/vendor/sm4/smutils.js` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/forceLightTheme.ts` | `src/jiaorong_src/brand/forceLightTheme.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/code-active.png` | `src/jiaorong_src/brand/icons/skill-detail/code-active.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/code-active@2x.png` | `src/jiaorong_src/brand/icons/skill-detail/code-active@2x.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/code.png` | `src/jiaorong_src/brand/icons/skill-detail/code.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/code@2x.png` | `src/jiaorong_src/brand/icons/skill-detail/code@2x.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/preview-active.png` | `src/jiaorong_src/brand/icons/skill-detail/preview-active.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/preview-active@2x.png` | `src/jiaorong_src/brand/icons/skill-detail/preview-active@2x.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/preview.png` | `src/jiaorong_src/brand/icons/skill-detail/preview.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/icons/skill-detail/preview@2x.png` | `src/jiaorong_src/brand/icons/skill-detail/preview@2x.png` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/index.ts` | `src/jiaorong_src/brand/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/brand/theme.less` | `src/jiaorong_src/brand/theme.less` | 整包已在工作区 |
| A | `src/jiaorong_src/config/settingsSidebarAdmin.ts` | `src/jiaorong_src/config/settingsSidebarAdmin.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/env.d.ts` | `src/jiaorong_src/env.d.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/index.ts` | `src/jiaorong_src/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/iframe/index.vue` | `src/jiaorong_src/knowledgeBase/iframe/index.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/mcp/ensureKnowledgeBaseMcpServer.ts` | `src/jiaorong_src/knowledgeBase/mcp/ensureKnowledgeBaseMcpServer.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/mcp/knowledgeBaseMcpConstants.ts` | `src/jiaorong_src/knowledgeBase/mcp/knowledgeBaseMcpConstants.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/mcp/knowledgeBaseMcpInstructions.ts` | `src/jiaorong_src/knowledgeBase/mcp/knowledgeBaseMcpInstructions.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/module.ts` | `src/jiaorong_src/knowledgeBase/module.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KbFileTypeIcon.vue` | `src/jiaorong_src/knowledgeBase/picker/KbFileTypeIcon.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KbIcon.vue` | `src/jiaorong_src/knowledgeBase/picker/KbIcon.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseMessageChips.vue` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseMessageChips.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerButton.vue` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerButton.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerDialog.less` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerDialog.less` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerDialog.vue` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBasePickerDialog.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseSelectionChips.less` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseSelectionChips.less` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseSelectionChips.vue` | `src/jiaorong_src/knowledgeBase/picker/KnowledgeBaseSelectionChips.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/formatFileSize.ts` | `src/jiaorong_src/knowledgeBase/picker/formatFileSize.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/prepareKnowledgeBaseSendFiles.ts` | `src/jiaorong_src/knowledgeBase/picker/prepareKnowledgeBaseSendFiles.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/resolveKbFileIcon.ts` | `src/jiaorong_src/knowledgeBase/picker/resolveKbFileIcon.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/resolveKbIconUrl.ts` | `src/jiaorong_src/knowledgeBase/picker/resolveKbIconUrl.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/types.ts` | `src/jiaorong_src/knowledgeBase/picker/types.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/knowledgeBase/picker/useKnowledgeBaseSelection.ts` | `src/jiaorong_src/knowledgeBase/picker/useKnowledgeBaseSelection.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/installMain.ts` | `src/jiaorong_src/logging/conversationTiming/installMain.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/modelTraceContext.ts` | `src/jiaorong_src/logging/conversationTiming/modelTraceContext.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/paths.ts` | `src/jiaorong_src/logging/conversationTiming/paths.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/safeWarn.ts` | `src/jiaorong_src/logging/conversationTiming/safeWarn.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/tracker.ts` | `src/jiaorong_src/logging/conversationTiming/tracker.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/types.ts` | `src/jiaorong_src/logging/conversationTiming/types.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/logging/conversationTiming/writer.ts` | `src/jiaorong_src/logging/conversationTiming/writer.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/prompts/defaultSystemPrompt.ts` | `src/jiaorong_src/prompts/defaultSystemPrompt.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/prompts/hostPromptLocalize.ts` | `src/jiaorong_src/prompts/hostPromptLocalize.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/prompts/systemPromptFinalize.ts` | `src/jiaorong_src/prompts/systemPromptFinalize.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/auth.ts` | `src/jiaorong_src/router/auth.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/index.ts` | `src/jiaorong_src/router/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/knowledgeBase.meta.ts` | `src/jiaorong_src/router/knowledgeBase.meta.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/knowledgeBase.ts` | `src/jiaorong_src/router/knowledgeBase.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/skills.meta.ts` | `src/jiaorong_src/router/skills.meta.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/router/skills.ts` | `src/jiaorong_src/router/skills.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/runtime/discover.ts` | `src/jiaorong_src/runtime/discover.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/runtime/modules.ts` | `src/jiaorong_src/runtime/modules.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/runtime/sidebar.ts` | `src/jiaorong_src/runtime/sidebar.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/runtime/types.ts` | `src/jiaorong_src/runtime/types.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/components/SkillUploadDialog/SkillUploadDialog.vue` | `src/jiaorong_src/skills/components/SkillUploadDialog/SkillUploadDialog.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/components/SkillUploadDialog/index.less` | `src/jiaorong_src/skills/components/SkillUploadDialog/index.less` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/index.ts` | `src/jiaorong_src/skills/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/defaultSkillInstallEvents.ts` | `src/jiaorong_src/skills/lib/defaultSkillInstallEvents.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/defaultSkillsManifest.ts` | `src/jiaorong_src/skills/lib/defaultSkillsManifest.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/defaultSkillsSeedBuildId.generated.ts` | `src/jiaorong_src/skills/lib/defaultSkillsSeedBuildId.generated.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/ensureDefaultSkills.ts` | `src/jiaorong_src/skills/lib/ensureDefaultSkills.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/formatSkillInstallError.ts` | `src/jiaorong_src/skills/lib/formatSkillInstallError.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/installLocalSkill.ts` | `src/jiaorong_src/skills/lib/installLocalSkill.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/resolveSkillTryPrompts.ts` | `src/jiaorong_src/skills/lib/resolveSkillTryPrompts.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/sessionSkill.ts` | `src/jiaorong_src/skills/lib/sessionSkill.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/skillCategories.ts` | `src/jiaorong_src/skills/lib/skillCategories.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/skillMarketCatalog.ts` | `src/jiaorong_src/skills/lib/skillMarketCatalog.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/lib/skillMarketTab.ts` | `src/jiaorong_src/skills/lib/skillMarketTab.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/module.ts` | `src/jiaorong_src/skills/module.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/pages/SkillDetailPage/SkillDetailPage.vue` | `src/jiaorong_src/skills/pages/SkillDetailPage/SkillDetailPage.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/pages/SkillDetailPage/index.less` | `src/jiaorong_src/skills/pages/SkillDetailPage/index.less` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue` | `src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/pages/SkillListPage/index.less` | `src/jiaorong_src/skills/pages/SkillListPage/index.less` | 整包已在工作区 |
| A | `src/jiaorong_src/skills/scripts/generateDefaultSkillsSeedBuildId.mjs` | `src/jiaorong_src/skills/scripts/generateDefaultSkillsSeedBuildId.mjs` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/downloadSkill/SkillOverwriteConfirmDialog.vue` | `src/jiaorong_src/utils/downloadSkill/SkillOverwriteConfirmDialog.vue` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/downloadSkill/confirmSkillOverwrite.ts` | `src/jiaorong_src/utils/downloadSkill/confirmSkillOverwrite.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/downloadSkill/index.ts` | `src/jiaorong_src/utils/downloadSkill/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/downloadSkill/installSkillFromZipUrl.ts` | `src/jiaorong_src/utils/downloadSkill/installSkillFromZipUrl.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/globalToast.ts` | `src/jiaorong_src/utils/globalToast.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/index.ts` | `src/jiaorong_src/utils/index.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/refreshSkillsCatalog.ts` | `src/jiaorong_src/utils/refreshSkillsCatalog.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/skillFileOperations.ts` | `src/jiaorong_src/utils/skillFileOperations.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/skillInstall.ts` | `src/jiaorong_src/utils/skillInstall.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/skillSwitch.ts` | `src/jiaorong_src/utils/skillSwitch.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/skillSwitchCore.ts` | `src/jiaorong_src/utils/skillSwitchCore.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/slashSuggestionSort.ts` | `src/jiaorong_src/utils/slashSuggestionSort.ts` | 整包已在工作区 |
| A | `src/jiaorong_src/utils/startGeneralChatWithSkills.ts` | `src/jiaorong_src/utils/startGeneralChatWithSkills.ts` | 整包已在工作区 |

### B-i18n

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `src/renderer/src/i18n/da-DK/about.json` | `src/renderer/src/i18n/da-DK/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/chat.json` | `src/renderer/src/i18n/da-DK/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/dialog.json` | `src/renderer/src/i18n/da-DK/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/index.ts` | `src/renderer/src/i18n/da-DK/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/mcp.json` | `src/renderer/src/i18n/da-DK/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/routes.json` | `src/renderer/src/i18n/da-DK/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/settings.json` | `src/renderer/src/i18n/da-DK/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/sync.json` | `src/renderer/src/i18n/da-DK/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/update.json` | `src/renderer/src/i18n/da-DK/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/da-DK/welcome.json` | `src/renderer/src/i18n/da-DK/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/about.json` | `src/renderer/src/i18n/de-DE/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/chat.json` | `src/renderer/src/i18n/de-DE/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/dialog.json` | `src/renderer/src/i18n/de-DE/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/index.ts` | `src/renderer/src/i18n/de-DE/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/mcp.json` | `src/renderer/src/i18n/de-DE/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/routes.json` | `src/renderer/src/i18n/de-DE/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/settings.json` | `src/renderer/src/i18n/de-DE/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/sync.json` | `src/renderer/src/i18n/de-DE/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/update.json` | `src/renderer/src/i18n/de-DE/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/de-DE/welcome.json` | `src/renderer/src/i18n/de-DE/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/about.json` | `src/renderer/src/i18n/en-US/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/chat.json` | `src/renderer/src/i18n/en-US/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/common.json` | `src/renderer/src/i18n/en-US/common.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/dialog.json` | `src/renderer/src/i18n/en-US/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/index.ts` | `src/renderer/src/i18n/en-US/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/mcp.json` | `src/renderer/src/i18n/en-US/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/routes.json` | `src/renderer/src/i18n/en-US/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/settings.json` | `src/renderer/src/i18n/en-US/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/sync.json` | `src/renderer/src/i18n/en-US/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/update.json` | `src/renderer/src/i18n/en-US/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/en-US/welcome.json` | `src/renderer/src/i18n/en-US/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/about.json` | `src/renderer/src/i18n/es-ES/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/chat.json` | `src/renderer/src/i18n/es-ES/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/dialog.json` | `src/renderer/src/i18n/es-ES/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/index.ts` | `src/renderer/src/i18n/es-ES/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/mcp.json` | `src/renderer/src/i18n/es-ES/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/routes.json` | `src/renderer/src/i18n/es-ES/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/settings.json` | `src/renderer/src/i18n/es-ES/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/sync.json` | `src/renderer/src/i18n/es-ES/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/update.json` | `src/renderer/src/i18n/es-ES/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/es-ES/welcome.json` | `src/renderer/src/i18n/es-ES/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/chat.json` | `src/renderer/src/i18n/fa-IR/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/dialog.json` | `src/renderer/src/i18n/fa-IR/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/routes.json` | `src/renderer/src/i18n/fa-IR/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/settings.json` | `src/renderer/src/i18n/fa-IR/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/sync.json` | `src/renderer/src/i18n/fa-IR/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/update.json` | `src/renderer/src/i18n/fa-IR/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fa-IR/welcome.json` | `src/renderer/src/i18n/fa-IR/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/about.json` | `src/renderer/src/i18n/fr-FR/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/chat.json` | `src/renderer/src/i18n/fr-FR/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/dialog.json` | `src/renderer/src/i18n/fr-FR/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/index.ts` | `src/renderer/src/i18n/fr-FR/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/mcp.json` | `src/renderer/src/i18n/fr-FR/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/routes.json` | `src/renderer/src/i18n/fr-FR/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/settings.json` | `src/renderer/src/i18n/fr-FR/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/sync.json` | `src/renderer/src/i18n/fr-FR/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/update.json` | `src/renderer/src/i18n/fr-FR/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/fr-FR/welcome.json` | `src/renderer/src/i18n/fr-FR/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/about.json` | `src/renderer/src/i18n/he-IL/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/chat.json` | `src/renderer/src/i18n/he-IL/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/dialog.json` | `src/renderer/src/i18n/he-IL/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/index.ts` | `src/renderer/src/i18n/he-IL/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/mcp.json` | `src/renderer/src/i18n/he-IL/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/routes.json` | `src/renderer/src/i18n/he-IL/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/settings.json` | `src/renderer/src/i18n/he-IL/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/sync.json` | `src/renderer/src/i18n/he-IL/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/update.json` | `src/renderer/src/i18n/he-IL/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/he-IL/welcome.json` | `src/renderer/src/i18n/he-IL/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/about.json` | `src/renderer/src/i18n/id-ID/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/chat.json` | `src/renderer/src/i18n/id-ID/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/dialog.json` | `src/renderer/src/i18n/id-ID/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/index.ts` | `src/renderer/src/i18n/id-ID/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/mcp.json` | `src/renderer/src/i18n/id-ID/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/routes.json` | `src/renderer/src/i18n/id-ID/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/settings.json` | `src/renderer/src/i18n/id-ID/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/sync.json` | `src/renderer/src/i18n/id-ID/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/update.json` | `src/renderer/src/i18n/id-ID/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/id-ID/welcome.json` | `src/renderer/src/i18n/id-ID/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/about.json` | `src/renderer/src/i18n/it-IT/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/chat.json` | `src/renderer/src/i18n/it-IT/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/dialog.json` | `src/renderer/src/i18n/it-IT/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/index.ts` | `src/renderer/src/i18n/it-IT/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/mcp.json` | `src/renderer/src/i18n/it-IT/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/routes.json` | `src/renderer/src/i18n/it-IT/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/settings.json` | `src/renderer/src/i18n/it-IT/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/sync.json` | `src/renderer/src/i18n/it-IT/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/update.json` | `src/renderer/src/i18n/it-IT/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/it-IT/welcome.json` | `src/renderer/src/i18n/it-IT/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/about.json` | `src/renderer/src/i18n/ja-JP/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/chat.json` | `src/renderer/src/i18n/ja-JP/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/dialog.json` | `src/renderer/src/i18n/ja-JP/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/routes.json` | `src/renderer/src/i18n/ja-JP/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/settings.json` | `src/renderer/src/i18n/ja-JP/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/sync.json` | `src/renderer/src/i18n/ja-JP/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ja-JP/welcome.json` | `src/renderer/src/i18n/ja-JP/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/about.json` | `src/renderer/src/i18n/ko-KR/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/chat.json` | `src/renderer/src/i18n/ko-KR/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/dialog.json` | `src/renderer/src/i18n/ko-KR/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/mcp.json` | `src/renderer/src/i18n/ko-KR/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/routes.json` | `src/renderer/src/i18n/ko-KR/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/settings.json` | `src/renderer/src/i18n/ko-KR/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/sync.json` | `src/renderer/src/i18n/ko-KR/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ko-KR/welcome.json` | `src/renderer/src/i18n/ko-KR/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/about.json` | `src/renderer/src/i18n/ms-MY/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/chat.json` | `src/renderer/src/i18n/ms-MY/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/dialog.json` | `src/renderer/src/i18n/ms-MY/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/index.ts` | `src/renderer/src/i18n/ms-MY/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/mcp.json` | `src/renderer/src/i18n/ms-MY/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/routes.json` | `src/renderer/src/i18n/ms-MY/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/settings.json` | `src/renderer/src/i18n/ms-MY/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/sync.json` | `src/renderer/src/i18n/ms-MY/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/update.json` | `src/renderer/src/i18n/ms-MY/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ms-MY/welcome.json` | `src/renderer/src/i18n/ms-MY/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/about.json` | `src/renderer/src/i18n/pl-PL/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/chat.json` | `src/renderer/src/i18n/pl-PL/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/dialog.json` | `src/renderer/src/i18n/pl-PL/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/index.ts` | `src/renderer/src/i18n/pl-PL/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/mcp.json` | `src/renderer/src/i18n/pl-PL/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/routes.json` | `src/renderer/src/i18n/pl-PL/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/settings.json` | `src/renderer/src/i18n/pl-PL/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/sync.json` | `src/renderer/src/i18n/pl-PL/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/update.json` | `src/renderer/src/i18n/pl-PL/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pl-PL/welcome.json` | `src/renderer/src/i18n/pl-PL/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/about.json` | `src/renderer/src/i18n/pt-BR/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/chat.json` | `src/renderer/src/i18n/pt-BR/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/dialog.json` | `src/renderer/src/i18n/pt-BR/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/index.ts` | `src/renderer/src/i18n/pt-BR/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/mcp.json` | `src/renderer/src/i18n/pt-BR/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/routes.json` | `src/renderer/src/i18n/pt-BR/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/settings.json` | `src/renderer/src/i18n/pt-BR/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/sync.json` | `src/renderer/src/i18n/pt-BR/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/update.json` | `src/renderer/src/i18n/pt-BR/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/pt-BR/welcome.json` | `src/renderer/src/i18n/pt-BR/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/about.json` | `src/renderer/src/i18n/ru-RU/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/chat.json` | `src/renderer/src/i18n/ru-RU/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/dialog.json` | `src/renderer/src/i18n/ru-RU/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/index.ts` | `src/renderer/src/i18n/ru-RU/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/mcp.json` | `src/renderer/src/i18n/ru-RU/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/routes.json` | `src/renderer/src/i18n/ru-RU/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/settings.json` | `src/renderer/src/i18n/ru-RU/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/sync.json` | `src/renderer/src/i18n/ru-RU/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/update.json` | `src/renderer/src/i18n/ru-RU/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/ru-RU/welcome.json` | `src/renderer/src/i18n/ru-RU/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/about.json` | `src/renderer/src/i18n/tr-TR/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/chat.json` | `src/renderer/src/i18n/tr-TR/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/dialog.json` | `src/renderer/src/i18n/tr-TR/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/index.ts` | `src/renderer/src/i18n/tr-TR/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/mcp.json` | `src/renderer/src/i18n/tr-TR/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/routes.json` | `src/renderer/src/i18n/tr-TR/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/settings.json` | `src/renderer/src/i18n/tr-TR/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/sync.json` | `src/renderer/src/i18n/tr-TR/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/update.json` | `src/renderer/src/i18n/tr-TR/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/tr-TR/welcome.json` | `src/renderer/src/i18n/tr-TR/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/about.json` | `src/renderer/src/i18n/vi-VN/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/chat.json` | `src/renderer/src/i18n/vi-VN/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/dialog.json` | `src/renderer/src/i18n/vi-VN/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/index.ts` | `src/renderer/src/i18n/vi-VN/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/mcp.json` | `src/renderer/src/i18n/vi-VN/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/routes.json` | `src/renderer/src/i18n/vi-VN/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/settings.json` | `src/renderer/src/i18n/vi-VN/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/sync.json` | `src/renderer/src/i18n/vi-VN/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/update.json` | `src/renderer/src/i18n/vi-VN/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/vi-VN/welcome.json` | `src/renderer/src/i18n/vi-VN/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/about.json` | `src/renderer/src/i18n/zh-CN/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/chat.json` | `src/renderer/src/i18n/zh-CN/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/common.json` | `src/renderer/src/i18n/zh-CN/common.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/dialog.json` | `src/renderer/src/i18n/zh-CN/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/index.ts` | `src/renderer/src/i18n/zh-CN/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/mcp.json` | `src/renderer/src/i18n/zh-CN/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/routes.json` | `src/renderer/src/i18n/zh-CN/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/settings.json` | `src/renderer/src/i18n/zh-CN/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/sync.json` | `src/renderer/src/i18n/zh-CN/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/update.json` | `src/renderer/src/i18n/zh-CN/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-CN/welcome.json` | `src/renderer/src/i18n/zh-CN/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/about.json` | `src/renderer/src/i18n/zh-HK/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/chat.json` | `src/renderer/src/i18n/zh-HK/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/common.json` | `src/renderer/src/i18n/zh-HK/common.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/dialog.json` | `src/renderer/src/i18n/zh-HK/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/index.ts` | `src/renderer/src/i18n/zh-HK/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/mcp.json` | `src/renderer/src/i18n/zh-HK/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/routes.json` | `src/renderer/src/i18n/zh-HK/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/settings.json` | `src/renderer/src/i18n/zh-HK/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/sync.json` | `src/renderer/src/i18n/zh-HK/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/update.json` | `src/renderer/src/i18n/zh-HK/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-HK/welcome.json` | `src/renderer/src/i18n/zh-HK/welcome.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/about.json` | `src/renderer/src/i18n/zh-TW/about.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/chat.json` | `src/renderer/src/i18n/zh-TW/chat.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/common.json` | `src/renderer/src/i18n/zh-TW/common.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/dialog.json` | `src/renderer/src/i18n/zh-TW/dialog.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/index.ts` | `src/renderer/src/i18n/zh-TW/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/mcp.json` | `src/renderer/src/i18n/zh-TW/mcp.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/routes.json` | `src/renderer/src/i18n/zh-TW/routes.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/settings.json` | `src/renderer/src/i18n/zh-TW/settings.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/sync.json` | `src/renderer/src/i18n/zh-TW/sync.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/update.json` | `src/renderer/src/i18n/zh-TW/update.json` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/i18n/zh-TW/welcome.json` | `src/renderer/src/i18n/zh-TW/welcome.json` | 路径已对上（交融改动需核） |

### C-renderer

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `src/renderer/api/SessionClient.ts` | `src/renderer/api/SessionClient.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/api/SkillClient.ts` | `src/renderer/api/SkillClient.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/api/ToolClient.ts` | `src/renderer/api/ToolClient.ts` | 路径已对上（交融改动需核） |
| A | `src/renderer/api/auth/index.ts` | `src/renderer/api/auth/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/floating/FloatingButton.vue` | `src/renderer/floating/FloatingButton.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/index.html` | `src/renderer/index.html` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/App.vue` | `src/renderer/settings/App.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/AboutUsSettings.vue` | `src/renderer/settings/components/AboutUsSettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/CommonSettings.vue` | `src/renderer/settings/components/CommonSettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/DeepChatAgentsSettings.vue` | `src/renderer/settings/components/DeepChatAgentsSettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/DisplaySettings.vue` | `src/renderer/settings/components/DisplaySettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/EnvironmentsSettings.vue` | `src/renderer/settings/components/EnvironmentsSettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/ShortcutSettings.vue` | `src/renderer/settings/components/ShortcutSettings.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/control-center/SettingsPageShell.vue` | `src/renderer/settings/components/control-center/SettingsPageShell.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/display/FontSettingsSection.vue` | `src/renderer/settings/components/display/FontSettingsSection.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/components/prompt/SystemPromptSettingsSection.vue` | `src/renderer/settings/components/prompt/SystemPromptSettingsSection.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/index.html` | `src/renderer/settings/index.html` | 路径已对上（交融改动需核） |
| M | `src/renderer/settings/main.ts` | `src/renderer/settings/main.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/splash/loading.vue` | `src/renderer/splash/loading.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/App.vue` | `src/renderer/src/App.vue` | 路径已对上（交融改动需核） |
| A | `src/renderer/src/assets/llm-icons/duihua.png` | `src/renderer/src/assets/llm-icons/duihua.png` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/assets/logo-dark.png` | `src/renderer/src/assets/logo-dark.png` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/assets/logo.png` | `src/renderer/src/assets/logo.png` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/assets/style.css` | `src/renderer/src/assets/style.css` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/AppBar.vue` | `src/renderer/src/components/AppBar.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/WindowSideBar.vue` | `src/renderer/src/components/WindowSideBar.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat-input/McpIndicator.vue` | `src/renderer/src/components/chat-input/McpIndicator.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat-input/SkillsPanel.vue` | `src/renderer/src/components/chat-input/SkillsPanel.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat-input/composables/useSkillsData.ts` | `src/renderer/src/components/chat-input/composables/useSkillsData.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/ChatInputBox.vue` | `src/renderer/src/components/chat/ChatInputBox.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/ChatInputToolbar.vue` | `src/renderer/src/components/chat/ChatInputToolbar.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/ChatStatusBar.vue` | `src/renderer/src/components/chat/ChatStatusBar.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/ChatToolInteractionOverlay.vue` | `src/renderer/src/components/chat/ChatToolInteractionOverlay.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/MessageList.vue` | `src/renderer/src/components/chat/MessageList.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/MessageListRow.vue` | `src/renderer/src/components/chat/MessageListRow.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/composables/useChatInputMentions.ts` | `src/renderer/src/components/chat/composables/useChatInputMentions.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/mentions/SuggestionList.vue` | `src/renderer/src/components/chat/mentions/SuggestionList.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/chat/mentions/utils.ts` | `src/renderer/src/components/chat/mentions/utils.ts` | 已补 `insert-tool` `@${displayLabel}`（H119） |
| M | `src/renderer/src/components/icons/ModelIcon.vue` | `src/renderer/src/components/icons/ModelIcon.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/message/MessageBlockToolCall.vue` | `src/renderer/src/components/message/MessageBlockToolCall.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/message/MessageInfo.vue` | `src/renderer/src/components/message/MessageInfo.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/message/MessageItemAssistant.vue` | `src/renderer/src/components/message/MessageItemAssistant.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/message/MessageItemUser.vue` | `src/renderer/src/components/message/MessageItemUser.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/components/think-content/ThinkContent.vue` | `src/renderer/src/components/think-content/ThinkContent.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/composables/message/useMessageCapture.ts` | `src/renderer/src/composables/message/useMessageCapture.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/composables/usePageCapture.example.ts` | `—` | 当前树缺失 |
| A | `src/renderer/src/composables/useToolDisplayLabelOptions.ts` | `src/renderer/src/composables/useToolDisplayLabelOptions.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/env.d.ts` | `src/renderer/src/env.d.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/events.ts` | `src/renderer/src/events.ts` | 路径已对上（交融改动需核） |
| A | `src/renderer/src/lib/shellBootstrap.ts` | `src/renderer/src/lib/shellBootstrap.ts` | 路径已对上（交融改动需核） |
| A | `src/renderer/src/lib/slashMenuDisplayText.ts` | `src/renderer/src/lib/slashMenuDisplayText.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/main.ts` | `src/renderer/src/main.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/pages/AgentWelcomePage.vue` | `src/renderer/src/pages/AgentWelcomePage.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/pages/ChatPage.vue` | `—` | 当前树缺失 |
| M | `src/renderer/src/pages/NewThreadPage.vue` | `src/renderer/src/pages/NewThreadPage.vue` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/router/index.ts` | `src/renderer/src/router/index.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/stores/ui/agent.ts` | `src/renderer/src/stores/ui/agent.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/stores/ui/draft.ts` | `src/renderer/src/stores/ui/draft.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/stores/ui/message.ts` | `src/renderer/src/stores/ui/message.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/stores/ui/session.ts` | `src/renderer/src/stores/ui/session.ts` | 路径已对上（交融改动需核） |
| M | `src/renderer/src/views/ChatTabView.vue` | `—` | 当前树缺失 |

### D-inmemory_mcp

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `src/main/presenter/mcpPresenter/inMemoryServers/appleServer.ts` | `src/main/mcp/inMemoryServers/appleServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/artifactsServer.ts` | `src/main/mcp/inMemoryServers/artifactsServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/bochaSearchServer.ts` | `src/main/mcp/inMemoryServers/bochaSearchServer.ts` | 路径已对上（中文需核） |
| M | `src/main/presenter/mcpPresenter/inMemoryServers/braveSearchServer.ts` | `src/main/mcp/inMemoryServers/braveSearchServer.ts` | 路径已对上（中文需核） |

### E-main

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `src/main/appMain.ts` | `src/main/appMain.ts` | 路径已对上（交融改动需核） |
| M | `src/main/events.ts` | `src/main/events.ts` | 路径已对上（交融改动需核） |
| M | `src/main/lib/agentRuntime/backgroundExecSessionManager.ts` | `—` | 当前树缺失 |
| M | `src/main/lib/agentRuntime/questionTool.ts` | `—` | 当前树缺失 |
| M | `src/main/lib/agentRuntime/sessionPaths.ts` | `src/main/agent/shared/storage/sessionPaths.ts` | 路径已对上（H108 走 appIdentity.getSessionsRoot） |
| M | `src/main/lib/agentRuntime/shellEnvHelper.ts` | `—` | 当前树缺失 |
| M | `src/main/lib/agentRuntime/systemEnvPromptBuilder.ts` | `src/main/agent/deepchat/resources/systemEnvPromptBuilder.ts` | 路径已对上（交融改动需核）；H99 环境段写死 Jiaorong-Ai |
| M | `src/main/lib/startupDeepLink.ts` | `src/main/lib/startupDeepLink.ts` | 路径已对上（交融改动需核） |
| M | `src/main/lib/terminalHelper.ts` | `src/main/lib/terminalHelper.ts` | 路径已对上（交融改动需核） |
| M | `src/main/lib/watermark.ts` | `src/main/lib/watermark.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/agentRepository/index.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/agentRuntimePresenter/dispatch.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/agentRuntimePresenter/index.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/agentSessionPresenter/index.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/configPresenter/acpLaunchSpecService.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/configPresenter/index.ts` | `—` | 当前树缺失 |
| A | `src/main/presenter/configPresenter/jsonStoreRecovery.ts` | `src/main/config/jsonStoreRecovery.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/configPresenter/mcpConfHelper.ts` | `src/main/mcp/settings.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/configPresenter/modelConfig.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/configPresenter/providers.ts` | `src/main/provider/defaults.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/configPresenter/systemPromptHelper.ts` | `src/main/agent/promptSettings.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/deeplinkPresenter/index.ts` | `src/main/deeplink/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/devicePresenter/index.ts` | `src/main/device/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/exporter/formats/conversationExporter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/exporter/formats/nowledgeMemExporter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/filePresenter/FilePresenter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/floatingButtonPresenter/FloatingButtonWindow.ts` | `src/main/desktop/floatingButton/FloatingButtonWindow.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/floatingButtonPresenter/index.ts` | `src/main/desktop/floatingButton/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/githubCopilotDeviceFlow.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/githubCopilotOAuth.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/index.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/lifecyclePresenter/SplashWindowManager.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/llmProviderPresenter/acp/acpCapabilities.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/llmProviderPresenter/acp/acpProcessManager.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/llmProviderPresenter/acp/acpTerminalManager.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/llmProviderPresenter/aiSdk/providerFactory.ts` | `src/main/provider/aiSdk/providerFactory.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/llmProviderPresenter/baseProvider.ts` | `src/main/provider/baseProvider.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/llmProviderPresenter/providers/githubCopilotProvider.ts` | `src/main/provider/providers/githubCopilotProvider.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/mcpPresenter/mcpClient.ts` | `src/main/mcp/mcpClient.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/mcpPresenter/mcprouterManager.ts` | `src/main/mcp/mcprouterManager.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/mcpPresenter/toolManager.ts` | `src/main/mcp/toolManager.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/oauthPresenter.ts` | `src/main/provider/auth/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/remoteControlPresenter/discord/discordRuntime.ts` | `src/main/remote/channels/discord/discordRuntime.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/remoteControlPresenter/feishu/feishuMarkdown.ts` | `src/main/remote/channels/feishu/feishuMarkdown.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/remoteControlPresenter/services/discordAuthGuard.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/discordCommandRouter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/feishuAuthGuard.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/feishuCommandRouter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/qqbotAuthGuard.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/qqbotCommandRouter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/remoteAuthGuard.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/remoteCommandRouter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/remoteConversationRunner.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/weixinIlinkAuthGuard.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/remoteControlPresenter/services/weixinIlinkCommandRouter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/shortcutPresenter.ts` | `src/main/desktop/shortcut.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/skillPresenter/index.ts` | `src/main/skill/index.ts` | 路径已对上（H106 遗留 skills 路径已核；H107 `SkillSettings.getPath` 写回） |
| M | `src/main/presenter/skillPresenter/skillExecutionService.ts` | `src/main/skill/skillExecutionService.ts` | 路径已对上（H105 环境变量已核） |
| M | `src/main/presenter/skillPresenter/toolNameMapping.ts` | `src/main/skill/toolNameMapping.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/skillSyncPresenter/adapters/copilotAdapter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/skillSyncPresenter/formatConverter.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/skillSyncPresenter/index.ts` | `—` | 当前树缺失 |
| M | `src/main/presenter/toolPresenter/agentTools/agentImageGenerationTool.ts` | `src/main/tool/agentTools/agentImageGenerationTool.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/toolPresenter/agentTools/agentTapeTools.ts` | `src/main/tool/agentTools/agentTapeTools.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/toolPresenter/agentTools/agentToolManager.ts` | `src/main/tool/agentTools/agentToolManager.ts` | 路径已对上（H105 技能环境已核） |
| M | `src/main/presenter/toolPresenter/agentTools/chatSettingsTools.ts` | `src/main/tool/agentTools/chatSettingsTools.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/toolPresenter/agentTools/subagentOrchestratorTool.ts` | `src/main/tool/agentTools/liveDelegationTool.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/toolPresenter/index.ts` | `src/main/tool/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/trayPresenter.ts` | `src/main/desktop/tray.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/upgradePresenter/index.ts` | `src/main/upgrade/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/presenter/windowPresenter/index.ts` | `src/main/desktop/window/index.ts` | 路径已对上（交融改动需核） |
| M | `src/main/routes/index.ts` | `src/main/routes/index.ts` | 路径已对上（交融改动需核） |
| A | `src/main/routes/onboarding/autoCompletePreconfiguredOnboarding.ts` | `src/main/onboarding/autoCompletePreconfiguredOnboarding.ts` | 路径已对上（交融改动需核） |

### G-shared

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| A | `src/shared/appIdentity.ts` | `src/shared/appIdentity.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/contracts/routes.ts` | `src/shared/contracts/routes.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/contracts/routes/skills.routes.ts` | `src/shared/contracts/routes/skills.routes.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/contracts/routes/tools.routes.ts` | `src/shared/contracts/routes/tools.routes.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/i18n.ts` | `src/shared/i18n.ts` | 路径已对上（交融改动需核） |
| A | `src/shared/legacyBrandAliases.ts` | `src/shared/legacyBrandAliases.ts` | 路径已对上（交融改动需核） |
| A | `src/shared/lib/toolDisplayMetadata.ts` | `src/renderer/src/lib/slashMenuDisplayText.ts` + `src/jiaorong_src/tools/toolDisplayNames.ts` | 路径已对上；静态对照表在 jiaorong（H117） |
| M | `src/shared/modelConfigDefaults.ts` | `src/shared/modelConfigDefaults.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/settingsNavigation.ts` | `src/shared/settingsNavigation.ts` | 路径已对上（交融改动需核） |
| A | `src/shared/settingsSidebarAdmin.ts` | `src/shared/settingsSidebarAdmin.ts` | 路径已对上（交融改动需核） |
| A | `src/shared/sidebarAgents.ts` | `src/shared/sidebarAgents.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/types/core/mcp.ts` | `src/shared/types/core/mcp.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/types/presenters/legacy.presenters.d.ts` | `—` | 当前树缺失 |
| M | `src/shared/types/presenters/tool.presenter.d.ts` | `—` | 当前树缺失 |
| M | `src/shared/types/skill.ts` | `src/shared/types/skill.ts` | 路径已对上（交融改动需核） |
| M | `src/shared/types/skillSync.ts` | `src/shared/types/skillSync.ts` | 路径已对上（交融改动需核） |

### H-builtin_skills

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `resources/skills/algorithmic-art/SKILL.md` | `resources/skills/algorithmic-art/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/code-review/SKILL.md` | `resources/skills/code-review/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/doc-coauthoring/SKILL.md` | `resources/skills/doc-coauthoring/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/docx/SKILL.md` | `resources/skills/docx/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/frontend-design/SKILL.md` | `resources/skills/frontend-design/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/git-commit/SKILL.md` | `resources/skills/git-commit/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/infographic-syntax-creator/SKILL.md` | `resources/skills/infographic-syntax-creator/SKILL.md` | 内置技能已在（内容需核） |
| R | `resources/skills/jiaorong-settings/SKILL.md` | `resources/skills/jiaorong-settings/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/mcp-builder/SKILL.md` | `resources/skills/mcp-builder/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/pdf/SKILL.md` | `resources/skills/pdf/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/pptx/SKILL.md` | `resources/skills/pptx/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/skill-creator/SKILL.md` | `resources/skills/skill-creator/SKILL.md` | 内置技能已在（H104 默认目录已核） |
| M | `resources/skills/skill-creator/scripts/init_skill.py` | `resources/skills/skill-creator/scripts/init_skill.py` | 内置技能已在（H104 默认目录已核） |
| M | `resources/skills/web-artifacts-builder/SKILL.md` | `resources/skills/web-artifacts-builder/SKILL.md` | 内置技能已在（内容需核） |
| M | `resources/skills/xlsx/SKILL.md` | `resources/skills/xlsx/SKILL.md` | 内置技能已在（内容需核） |

### I-resources

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| A | `resources/app.ico` | `resources/app.ico` | 路径已对上 |
| M | `resources/icon.ico` | `resources/icon.ico` | 路径已对上 |
| M | `resources/icon.png` | `resources/icon.png` | 路径已对上 |
| M | `resources/linux_tray.png` | `resources/linux_tray.png` | 路径已对上 |
| M | `resources/macTrayTemplate.png` | `resources/macTrayTemplate.png` | 路径已对上 |
| M | `resources/win_tray.ico` | `resources/win_tray.ico` | 路径已对上 |

### J-test_jiaorong

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| A | `test/renderer/jiaorong/auth/responseErrorFn.test.ts` | `test/renderer/jiaorong/auth/responseErrorFn.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/auth/sessionValidation.test.ts` | `test/renderer/jiaorong/auth/sessionValidation.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/formatFileSize.test.ts` | `test/renderer/jiaorong/knowledgeBase/formatFileSize.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/knowledgeBaseMcpInstructions.test.ts` | `test/renderer/jiaorong/knowledgeBase/knowledgeBaseMcpInstructions.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/mcpConfig.test.ts` | `test/renderer/jiaorong/knowledgeBase/mcpConfig.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/prepareKnowledgeBaseSendFiles.test.ts` | `test/renderer/jiaorong/knowledgeBase/prepareKnowledgeBaseSendFiles.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/resolveKbFileIcon.test.ts` | `test/renderer/jiaorong/knowledgeBase/resolveKbFileIcon.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/resolveKbIconUrl.test.ts` | `test/renderer/jiaorong/knowledgeBase/resolveKbIconUrl.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/resolveKnowledgeBaseUrl.test.ts` | `test/renderer/jiaorong/knowledgeBase/resolveKnowledgeBaseUrl.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/toMcpSelections.test.ts` | `test/renderer/jiaorong/knowledgeBase/toMcpSelections.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/knowledgeBase/useKnowledgeBaseSelection.test.ts` | `test/renderer/jiaorong/knowledgeBase/useKnowledgeBaseSelection.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/logging/conversationTiming.test.ts` | `test/renderer/jiaorong/logging/conversationTiming.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/prompts/systemPromptFinalize.test.ts` | `test/renderer/jiaorong/prompts/systemPromptFinalize.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/defaultSkillsSeed.test.ts` | `test/renderer/jiaorong/skills/defaultSkillsSeed.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/formatSkillInstallError.test.ts` | `test/renderer/jiaorong/skills/formatSkillInstallError.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/installLocalSkill.test.ts` | `test/renderer/jiaorong/skills/installLocalSkill.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/isProtectedSystemSkill.test.ts` | `test/renderer/jiaorong/skills/isProtectedSystemSkill.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/isSkillVisibleInMarket.test.ts` | `test/renderer/jiaorong/skills/isSkillVisibleInMarket.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/mockSkills.test.ts` | `—` | 当前树缺失 |
| A | `test/renderer/jiaorong/skills/resolveSkillTryPrompts.test.ts` | `test/renderer/jiaorong/skills/resolveSkillTryPrompts.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/skillCategories.test.ts` | `test/renderer/jiaorong/skills/skillCategories.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/skillMarketCatalog.test.ts` | `test/renderer/jiaorong/skills/skillMarketCatalog.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/skills/skillMarketTab.test.ts` | `test/renderer/jiaorong/skills/skillMarketTab.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/utils/refreshSkillsCatalog.test.ts` | `test/renderer/jiaorong/utils/refreshSkillsCatalog.test.ts` | jiaorong 测试已在 |
| A | `test/renderer/jiaorong/utils/slashSuggestionSort.test.ts` | `test/renderer/jiaorong/utils/slashSuggestionSort.test.ts` | jiaorong 测试已在 |

### K-test

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `test/README.md` | `test/README.md` | 路径已对上 |
| M | `test/e2e/README.md` | `test/e2e/README.md` | 路径已对上 |
| M | `test/e2e/fixtures/electronApp.ts` | `test/e2e/fixtures/electronApp.ts` | 路径已对上 |
| M | `test/main/lib/agentRuntime/backgroundExecSessionManager.test.ts` | `—` | 当前树缺失 |
| M | `test/main/lib/agentRuntime/fffSearchService.test.ts` | `—` | 当前树缺失 |
| M | `test/main/lib/agentRuntime/sessionPaths.test.ts` | `test/main/agent/shared/storage/sessionPaths.test.ts` | 路径已对上（H108 断言 `.jiaorongchat`） |
| M | `test/main/lib/startupDeepLink.test.ts` | `test/main/lib/startupDeepLink.test.ts` | 路径已对上 |
| M | `test/main/presenter/agentRepository.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentRuntimePresenter/agentRuntimePresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentRuntimePresenter/contextBuilder.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentRuntimePresenter/dispatch.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentRuntimePresenter/process.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentSessionPresenter/agentSessionPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/agentSessionPresenter/messageManager.test.ts` | `—` | 当前树缺失 |
| A | `test/main/presenter/configPresenter/jsonStoreRecovery.test.ts` | `test/main/config/jsonStoreRecovery.test.ts` | 路径已对上 |
| M | `test/main/presenter/configPresenter/mcpConfHelper.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/deeplinkPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/devicePresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/floatingButtonPresenter/index.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/floatingButtonPresenter/layout.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/lifecyclePresenter/DatabaseInitializer.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/acp/acpProcessManager.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/acp/acpTerminalManager.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/aiSdkProviderFactory.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/aiSdkStreamAdapter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/aihubmixProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/anthropicProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/awsBedrockProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/backgroundModelSync.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/baseProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/doubaoProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/geminiProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/mistralProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/newApiProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/openAICompatibleProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/openAIResponsesProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/llmProviderPresenter/zenmuxProvider.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/pluginPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/projectPresenter/projectPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/discordAdapter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/feishuAdapter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/feishuCommandRouter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/feishuRuntime.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/remoteBindingStore.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/remoteCommandRouter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/remoteControlPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/remoteConversationRunner.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/remoteControlPresenter/telegramPoller.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/shortcutPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/skillPresenter/discoveryWorker.test.ts` | `test/main/skill/discoveryWorker.test.ts` | 路径已对上 |
| M | `test/main/presenter/skillPresenter/skillPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/skillPresenter/toolNameMapping.test.ts` | `test/main/skill/toolNameMapping.test.ts` | 路径已对上 |
| M | `test/main/presenter/skillSyncPresenter/adapters/copilotAdapter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/skillSyncPresenter/formatConverter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/sqlitePresenter/deepchatMessagesTable.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/toolPresenter/agentTools/agentTapeTools.test.ts` | `test/main/tool/agentTools/agentTapeTools.test.ts` | 路径已对上 |
| M | `test/main/presenter/toolPresenter/agentTools/agentToolManagerSettings.test.ts` | `test/main/tool/agentTools/agentToolManagerSettings.test.ts` | 路径已对上 |
| M | `test/main/presenter/toolPresenter/agentTools/subagentOrchestratorTool.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/toolPresenter/toolPresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/presenter/upgradePresenter.test.ts` | `—` | 当前树缺失 |
| M | `test/main/routes/contracts.test.ts` | `test/main/routes/contracts.test.ts` | 路径已对上 |
| M | `test/main/routes/dispatcher.test.ts` | `test/main/routes/dispatcher.test.ts` | 路径已对上 |
| A | `test/main/routes/onboarding/autoCompletePreconfiguredOnboarding.test.ts` | `test/main/onboarding/autoCompletePreconfiguredOnboarding.test.ts` | 路径已对上 |
| M | `test/main/routes/providers/providerImportService.test.ts` | `—` | 当前树缺失 |
| M | `test/main/scripts/afterPack.test.ts` | `test/main/scripts/afterPack.test.ts` | 路径已对上 |
| M | `test/main/scripts/signCuaHelper.test.ts` | `test/main/scripts/signCuaHelper.test.ts` | 路径已对上 |
| A | `test/main/shared/appIdentity.test.ts` | `test/main/shared/appIdentity.test.ts` | 路径已对上 |
| A | `test/main/shared/legacyBrandAliases.test.ts` | `test/main/shared/legacyBrandAliases.test.ts` | 路径已对上 |
| M | `test/main/shared/modelConfigDefaults.test.ts` | `test/main/shared/modelConfigDefaults.test.ts` | 路径已对上 |
| M | `test/manual/deeplink-playground.html` | `test/manual/deeplink-playground.html` | 路径已对上 |
| M | `test/mocks/electron.ts` | `test/mocks/electron.ts` | 路径已对上 |
| M | `test/renderer/api/clients.test.ts` | `test/renderer/api/clients.test.ts` | 路径已对上 |
| M | `test/renderer/components/AboutUsSettings.test.ts` | `test/renderer/components/AboutUsSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/AgentWelcomePage.test.ts` | `test/renderer/components/AgentWelcomePage.test.ts` | 路径已对上 |
| M | `test/renderer/components/App.startup.test.ts` | `test/renderer/components/App.startup.test.ts` | 路径已对上 |
| M | `test/renderer/components/ChatInputBox.test.ts` | `test/renderer/components/ChatInputBox.test.ts` | 路径已对上 |
| M | `test/renderer/components/ChatPage.test.ts` | `test/renderer/components/ChatPage.test.ts` | 路径已对上 |
| M | `test/renderer/components/ChatTabView.test.ts` | `test/renderer/components/ChatTabView.test.ts` | 路径已对上 |
| M | `test/renderer/components/DashboardSettings.test.ts` | `test/renderer/components/DashboardSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/DataSettings.test.ts` | `test/renderer/components/DataSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/DeepChatAgentsSettings.test.ts` | `test/renderer/components/DeepChatAgentsSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/EnvironmentsSettings.test.ts` | `test/renderer/components/EnvironmentsSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/McpIndicator.test.ts` | `test/renderer/components/McpIndicator.test.ts` | 路径已对上 |
| M | `test/renderer/components/NewThreadPage.onboarding.test.ts` | `test/renderer/components/NewThreadPage.onboarding.test.ts` | 路径已对上 |
| M | `test/renderer/components/NewThreadPage.test.ts` | `test/renderer/components/NewThreadPage.test.ts` | 路径已对上 |
| M | `test/renderer/components/PluginsSettings.test.ts` | `test/renderer/components/PluginsSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/RemoteSettings.test.ts` | `test/renderer/components/RemoteSettings.test.ts` | 路径已对上 |
| M | `test/renderer/components/SpotlightOverlay.test.ts` | `test/renderer/components/SpotlightOverlay.test.ts` | 路径已对上 |
| M | `test/renderer/components/WindowSideBar.test.ts` | `test/renderer/components/WindowSideBar.test.ts` | 路径已对上 |
| M | `test/renderer/components/message/MessageBlockToolCall.test.ts` | `test/renderer/components/message/MessageBlockToolCall.test.ts` | 路径已对上 |
| M | `test/renderer/composables/useArtifactExport.test.ts` | `test/renderer/composables/useArtifactExport.test.ts` | 路径已对上 |
| M | `test/renderer/composables/useChatInputMentions.test.ts` | `test/renderer/composables/useChatInputMentions.test.ts` | 路径已对上 |
| M | `test/renderer/lib/chatSearch.test.ts` | `test/renderer/lib/chatSearch.test.ts` | 路径已对上 |
| A | `test/renderer/lib/slashMenuDisplayText.test.ts` | `test/renderer/lib/slashMenuDisplayText.test.ts` | 路径已对上 |
| M | `test/renderer/plugins/cuaSettings.test.ts` | `test/renderer/plugins/cuaSettings.test.ts` | 路径已对上 |
| M | `test/renderer/stores/agentStore.test.ts` | `test/renderer/stores/agentStore.test.ts` | 路径已对上 |
| M | `test/renderer/stores/draft.test.ts` | `test/renderer/stores/draft.test.ts` | 路径已对上 |
| M | `test/renderer/stores/mcpStore.test.ts` | `test/renderer/stores/mcpStore.test.ts` | 路径已对上 |
| M | `test/renderer/stores/messageStore.test.ts` | `test/renderer/stores/messageStore.test.ts` | 路径已对上 |
| M | `test/renderer/stores/sessionStore.test.ts` | `test/renderer/stores/sessionStore.test.ts` | 路径已对上 |
| M | `test/setup.ts` | `test/setup.ts` | 路径已对上 |

### L-docs

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `docs/ARCHITECTURE.md` | `docs/ARCHITECTURE.md` | 文档可后搬 |
| M | `docs/FLOWS.md` | `docs/FLOWS.md` | 文档可后搬 |
| M | `docs/README.md` | `docs/README.md` | 文档可后搬 |
| M | `docs/architecture/agent-fff-node-api-search/plan.md` | `—` | 文档可后搬 |
| M | `docs/architecture/agent-fff-node-api-search/spec.md` | `—` | 文档可后搬 |
| M | `docs/architecture/agent-system.md` | `docs/architecture/agent-system.md` | 文档可后搬 |
| M | `docs/architecture/chat-scroll-windowing/spec.md` | `—` | 文档可后搬 |
| M | `docs/architecture/event-system.md` | `docs/architecture/event-system.md` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p0/plan.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p0/spec.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p0/tasks.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p1/plan.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p1/spec.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-host-thinning-p1/tasks.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-login-ui-migrate/plan.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-login-ui-migrate/spec.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-login-ui-migrate/tasks.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-src-skeleton/plan.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-src-skeleton/spec.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorong-src-skeleton/tasks.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorongchat-brand-identity/plan.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorongchat-brand-identity/spec.md` | `—` | 文档可后搬 |
| A | `docs/architecture/jiaorongchat-brand-identity/tasks.md` | `—` | 文档可后搬 |
| M | `docs/architecture/tool-system.md` | `docs/architecture/tool-system.md` | 文档可后搬 |
| A | `docs/archives/settings-about-page-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-about-page-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-about-page-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-agents-control-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-agents-control-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-agents-control-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-display-page-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-display-page-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-display-page-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-environments-page-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-environments-page-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-environments-page-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-general-page-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-general-page-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-general-page-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-page-navigation-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-page-navigation-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-page-navigation-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-shortcuts-page-colors/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-shortcuts-page-colors/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/settings-shortcuts-page-colors/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/sidebar-primary-icon-color/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/sidebar-primary-icon-color/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/sidebar-primary-icon-color/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-detail-markdown-view-icons/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-detail-markdown-view-icons/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-detail-markdown-view-icons/tasks.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-hub-entry-placeholders/ARCHIVE.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-hub-entry-placeholders/plan.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-hub-entry-placeholders/spec.md` | `—` | 文档可后搬 |
| A | `docs/archives/skill-hub-entry-placeholders/tasks.md` | `—` | 文档可后搬 |
| M | `docs/features/acp-v1-reliability/plan.md` | `docs/features/acp-v1-reliability/plan.md` | 文档可后搬 |
| M | `docs/features/acp-v1-reliability/spec.md` | `docs/features/acp-v1-reliability/spec.md` | 文档可后搬 |
| M | `docs/features/acp-v1-reliability/tasks.md` | `docs/features/acp-v1-reliability/tasks.md` | 文档可后搬 |
| M | `docs/features/agent-session-transfer/plan.md` | `—` | 文档可后搬 |
| M | `docs/features/agent-session-transfer/spec.md` | `—` | 文档可后搬 |
| M | `docs/features/agent-session-transfer/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/auth-api-env-modes/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/auth-api-env-modes/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/auth-api-env-modes/tasks.md` | `—` | 文档可后搬 |
| M | `docs/features/automatic-turn-activity-collapse/spec.md` | `—` | 文档可后搬 |
| M | `docs/features/cloud-sync-s3/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-logs/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-logs/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-logs/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-x-trace-id/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-x-trace-id/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/conversation-timing-x-trace-id/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/create-skill-chat-entry/implementation.md` | `—` | 文档可后搬 |
| A | `docs/features/create-skill-chat-entry/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/create-skill-chat-entry/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/create-skill-chat-entry/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/default-skills-seed/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/default-skills-seed/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/default-skills-seed/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/force-light-theme/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/force-light-theme/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/force-light-theme/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/install-skill-from-zip-url/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/install-skill-from-zip-url/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/install-skill-from-zip-url/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-brand-theme/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-brand-theme/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-brand-theme/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-mcp/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-mcp/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-mcp/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-menu/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-menu/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-menu/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-picker/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-picker/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/jiaorong-knowledge-base-picker/tasks.md` | `—` | 文档可后搬 |
| M | `docs/features/remote-agent-switch/plan.md` | `—` | 文档可后搬 |
| M | `docs/features/remote-agent-switch/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-filter/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-filter/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-filter/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-from-api/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-from-api/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-category-from-api/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-entry/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-entry/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-entry/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-list-ui/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-list-ui/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-list-ui/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-upload/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-upload/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-center-upload/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-creator-default-dir/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-creator-default-dir/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-creator-default-dir/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-api-hook/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-api-hook/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-api-hook/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-delete-confirm/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-delete-confirm/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-delete-confirm/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-install/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-install/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-install/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-page/implementation.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-page/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-page/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-page/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-responsive/changes.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-responsive/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-responsive/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-detail-responsive/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-list-tab-restore/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-list-tab-restore/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-list-tab-restore/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-exclude-user-local/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-exclude-user-local/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-exclude-user-local/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-list-ui/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-list-ui/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-market-list-ui/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-switch-utils/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-switch-utils/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-switch-utils/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-yaml-try-prompts/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-yaml-try-prompts/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/skill-yaml-try-prompts/tasks.md` | `—` | 文档可后搬 |
| A | `docs/features/slash-skill-sort-zh-en/plan.md` | `—` | 文档可后搬 |
| A | `docs/features/slash-skill-sort-zh-en/spec.md` | `—` | 文档可后搬 |
| A | `docs/features/slash-skill-sort-zh-en/tasks.md` | `—` | 文档可后搬 |
| M | `docs/features/windows-arm64-support/spec.md` | `—` | 文档可后搬 |
| M | `docs/guides/getting-started.md` | `docs/guides/getting-started.md` | 文档可后搬 |
| M | `docs/guides/plugin-packaging.md` | `docs/guides/plugin-packaging.md` | 文档可后搬 |
| A | `docs/guides/skill-tool-display-localization.md` | `—` | 文档可后搬 |
| M | `docs/issues/agent-loop-input-exec-responsiveness/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/ai-sdk-system-message-warning/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/ask-user-empty-prompt-compaction-order/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/browser-rich-url-paste/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-sync-on-update/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-sync-on-update/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-sync-on-update/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-uninstall-guard/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-uninstall-guard/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/builtin-skill-uninstall-guard/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/cc-switch-config-path-discovery/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/chat-history-open-slow/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/chat-history-open-slow/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/chat-history-open-slow/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/cherry-studio-config-path-discovery/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/chinese-thinking-english-drift/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/chinese-thinking-english-drift/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/chinese-thinking-english-drift/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/corrupt-app-settings-white-screen/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/corrupt-app-settings-white-screen/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/corrupt-app-settings-white-screen/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/cua-driver-v0-2-0-sync/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/cua-driver-v0-2-0-sync/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/cua-driver-v0-2-0-sync/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/dev-update-check-stuck/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/dev-update-check-stuck/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/dev-update-check-stuck/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/fff-packaged-native-loading/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/floating-button-position-persistence/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/image-generation-context-budget-bypass/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/image-generation-context-budget-bypass/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-four-fixes/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-four-fixes/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-four-fixes/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-kb-mcp-usage-instruction/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-kb-mcp-usage-instruction/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/jiaorong-kb-mcp-usage-instruction/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/mac-app-name-identity/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/mac-app-name-identity/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/mac-native-feel-audit/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/mac-native-feel-audit/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/openai-compatible-video-prompt-duration-fallback/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/opendal-native-binding-release/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/reclick-session-clears-model/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/reclick-session-clears-model/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/reclick-session-clears-model/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/session-list-load-more-cursor/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/session-list-load-more-cursor/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/session-list-load-more-cursor/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/sidebar-auth-blocks-ui/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/sidebar-auth-blocks-ui/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/sidebar-auth-blocks-ui/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-card-block-nav-while-installing/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-card-block-nav-while-installing/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-card-block-nav-while-installing/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-catalog-stale-after-builtin-sync/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-catalog-stale-after-builtin-sync/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-catalog-stale-after-builtin-sync/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-delete-dialog-click/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-delete-dialog-click/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-delete-dialog-click/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-hide-protected-delete/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-hide-protected-delete/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-detail-hide-protected-delete/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-install-error-zh/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-install-error-zh/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-install-error-zh/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-list-stale-after-uninstall/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-list-stale-after-uninstall/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-list-stale-after-uninstall/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-display-name-on-install/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-display-name-on-install/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-display-name-on-install/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-duplicate-slug-card/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-duplicate-slug-card/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-market-duplicate-slug-card/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-md-upload-downloads-parent/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-md-upload-downloads-parent/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-md-upload-downloads-parent/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-remote-fields-lost-after-reinstall/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-remote-fields-lost-after-reinstall/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-remote-fields-lost-after-reinstall/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-root-level-uninstall-fail/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-root-level-uninstall-fail/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-root-level-uninstall-fail/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-dedupe-win-picker/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-dedupe-win-picker/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-dedupe-win-picker/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-win-hang/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-win-hang/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-overwrite-win-hang/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-win-single-dropzone/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-win-single-dropzone/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-upload-win-single-dropzone/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-use-restores-stale-session/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-use-restores-stale-session/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-use-restores-stale-session/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-zip-assets-and-win-uninstall/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-zip-assets-and-win-uninstall/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skill-zip-assets-and-win-uninstall/tasks.md` | `—` | 文档可后搬 |
| A | `docs/issues/skills-early-click-hides-deepchat-agent/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/skills-early-click-hides-deepchat-agent/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/skills-early-click-hides-deepchat-agent/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/skills-path-cross-platform-repair/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/skills-path-cross-platform-repair/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/slash-skills-stale-after-create/plan.md` | `—` | 文档可后搬 |
| A | `docs/issues/slash-skills-stale-after-create/spec.md` | `—` | 文档可后搬 |
| A | `docs/issues/slash-skills-stale-after-create/tasks.md` | `—` | 文档可后搬 |
| M | `docs/issues/stop-pauses-pending-queue/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/telegram-message-markdown-render/spec.md` | `—` | 文档可后搬 |
| M | `docs/issues/windows-arm64-duckdb-upgrade/plan.md` | `—` | 文档可后搬 |
| M | `docs/issues/windows-arm64-duckdb-upgrade/spec.md` | `—` | 文档可后搬 |
| M | `docs/release-flow.md` | `docs/release-flow.md` | 文档可后搬 |
| M | `docs/spec-driven-dev.md` | `docs/spec-driven-dev.md` | 文档可后搬 |

### M-ci

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `.github/ISSUE_TEMPLATE/bug.yml` | `.github/ISSUE_TEMPLATE/bug.yml` | CI按现网重接 |
| M | `.github/ISSUE_TEMPLATE/feature.yml` | `.github/ISSUE_TEMPLATE/feature.yml` | CI按现网重接 |
| A | `.github/workflows/build-test.yml` | `—` | CI按现网重接 |
| M | `.github/workflows/build.yml` | `.github/workflows/build.yml` | CI按现网重接 |
| M | `.github/workflows/release.yml` | `.github/workflows/release.yml` | CI按现网重接 |
| M | `.github/workflows/windows-arm64-e2e.yml` | `.github/workflows/windows-arm64-e2e.yml` | CI按现网重接 |

### N-agents_sdd

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `.agents/skills/deepchat-data-import/SKILL.md` | `.agents/skills/deepchat-data-import/SKILL.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-data-import/agents/openai.yaml` | `.agents/skills/deepchat-data-import/agents/openai.yaml` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-data-import/references/data-locations.md` | `.agents/skills/deepchat-data-import/references/data-locations.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-data-import/references/import-recipes.md` | `.agents/skills/deepchat-data-import/references/import-recipes.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-data-import/references/schema-reference.md` | `.agents/skills/deepchat-data-import/references/schema-reference.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-data-import/references/sqlite-access.md` | `.agents/skills/deepchat-data-import/references/sqlite-access.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-release/SKILL.md` | `.agents/skills/deepchat-release/SKILL.md` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-release/agents/openai.yaml` | `.agents/skills/deepchat-release/agents/openai.yaml` | SDD文档可后搬 |
| M | `.agents/skills/deepchat-release/references/release-checklist.md` | `.agents/skills/deepchat-release/references/release-checklist.md` | SDD文档可后搬 |
| D | `.agents/skills/deepchat-sdd/agents/openai.yaml` | `—` | master已删 |
| A | `.agents/skills/jiaorong-sdd-zh/SKILL.md` | `.agents/skills/jiaorong-sdd-zh/SKILL.md` | 路径已对上 |
| A | `.agents/skills/jiaorong-sdd-zh/agents/openai.yaml` | `.agents/skills/jiaorong-sdd-zh/agents/openai.yaml` | 路径已对上 |
| R | `.agents/skills/jiaorong-sdd/SKILL.md` | `.agents/skills/jiaorong-sdd/SKILL.md` | 路径已对上 |
| A | `.agents/skills/jiaorong-sdd/agents/openai.yaml` | `.agents/skills/jiaorong-sdd/agents/openai.yaml` | 路径已对上 |

### O-scripts

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `scripts/afterPack.js` | `scripts/afterPack.js` | 路径已对上（交融改动需核） |
| M | `scripts/build-cua-plugin-runtime.mjs` | `scripts/build-cua-plugin-runtime.mjs` | 路径已对上 |
| M | `scripts/notarize.js` | `scripts/notarize.js` | 路径已对上 |
| M | `scripts/package-plugin.mjs` | `scripts/package-plugin.mjs` | 路径已对上 |

### P-other

| 状态 | master 路径 | 当前路径 | 判定 |
|------|-------------|----------|------|
| M | `.env.example` | `.env.example` | 路径已对上 |
| M | `.gitignore` | `.gitignore` | 路径已对上 |
| M | `CHANGELOG.md` | `CHANGELOG.md` | 路径已对上 |
| M | `CONTRIBUTING.md` | `CONTRIBUTING.md` | 路径已对上 |
| M | `CONTRIBUTING.zh.md` | `CONTRIBUTING.zh.md` | 路径已对上 |
| D | `README.jp.md` | `—` | master已删 |
| M | `README.md` | `README.md` | 路径已对上 |
| M | `README.zh.md` | `README.zh.md` | 路径已对上 |
| M | `build/generate-version-files.mjs` | `build/generate-version-files.mjs` | 路径已对上 |
| M | `build/icon.icns` | `build/icon.icns` | 路径已对上 |
| M | `build/icon.ico` | `build/icon.ico` | 路径已对上 |
| M | `build/icon.png` | `build/icon.png` | 路径已对上 |
| A | `dev-app-update.yml` | `dev-app-update.yml` | 路径已对上 |
| M | `electron-builder.yml` | `electron-builder.yml` | 路径已对上 |
| M | `electron.vite.config.ts` | `electron.vite.config.ts` | 路径已对上 |
| M | `package.json` | `package.json` | 路径已对上 |
| M | `plugins/cua/plugin.json` | `plugins/cua/plugin.json` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/settings/assets/index.js` | `plugins/cua/settings/assets/index.js` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/skills/cua-driver/README.md` | `—` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/skills/cua-driver/SKILL.md` | `—` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/skills/cua-driver/TESTS.md` | `—` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Skills/cua-driver/README.md` | `plugins/cua/vendor/cua-driver/source/Skills/cua-driver/README.md` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Skills/cua-driver/SKILL.md` | `plugins/cua/vendor/cua-driver/source/Skills/cua-driver/SKILL.md` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/BundleHelpers.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/BundleHelpers.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/CallCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/CallCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/ConfigCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/ConfigCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/CuaDriverCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/CuaDriverCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/DiagnoseCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/DiagnoseCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/Docs/CLIDocExtractor.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/Docs/CLIDocExtractor.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/DoctorCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/DoctorCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/ServeCommand.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCLI/ServeCommand.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCore/Config/ConfigStore.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCore/Config/ConfigStore.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCore/Permissions/PermissionsGate.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverCore/Permissions/PermissionsGate.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/CuaDriverMCPServer.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/CuaDriverMCPServer.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/CheckPermissionsTool.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/CheckPermissionsTool.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/ClickTool.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/ClickTool.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/RightClickTool.swift` | `plugins/cua/vendor/cua-driver/source/Sources/CuaDriverServer/Tools/RightClickTool.swift` | 上游插件，不整文件覆盖 |
| M | `plugins/cua/vendor/cua-driver/upstream.json` | `plugins/cua/vendor/cua-driver/upstream.json` | 上游插件，不整文件覆盖 |
| M | `plugins/feishu/plugin.json` | `plugins/feishu/plugin.json` | 路径已对上 |
| M | `plugins/feishu/skills/feishu-tools/SKILL.md` | `plugins/feishu/skills/feishu-tools/SKILL.md` | 路径已对上 |
| A | `pnpm-lock.yaml` | `pnpm-lock.yaml` | 路径已对上 |
| A | `skillhub-skills-transformed.md` | `—` | 当前树缺失 |
| M | `tsconfig.app.json` | `tsconfig.app.json` | 路径已对上 |
| M | `tsconfig.app.tsgo.json` | `—` | 当前树缺失 |
| M | `tsconfig.node.json` | `tsconfig.node.json` | 路径已对上 |
| M | `vitest.config.renderer.ts` | `vitest.config.renderer.ts` | 路径已对上 |
| M | `vitest.config.ts` | `vitest.config.ts` | 路径已对上 |
