# 计划

- `mainLogEvents.ts` 联合类型 + `STARTUP_COMPONENTS` + 测试 `it.each` 补 `tape_bootstrap_backfill`。
- `afterPack.js` desktop MimeType 与 `xdg-mime` 增加 `x-scheme-handler/deepchat`；更新 afterPack 测试与 H103。
- `resources/skills/jiaorong-cli/SKILL.md` 与 CUA vendor `Skills/cua-driver/SKILL.md` 产品名替换；命令 `deepchat` 保留。
- 技能目录与 frontmatter `name` 改为 `jiaorong-cli`；`READ_ONLY_BUNDLED_SKILL_NAMES` / `BUILTIN_SKILL_NAMES` 同步；`SKILL_NAME_ALIASES` 与 `legacyBrandAliases` 增加 `deepchat-cli`→`jiaorong-cli`；启动时清用户目录残留。
- `listRemoteSkills` 非成功码抛错；`buildSkillMarketCatalog` 远程失败记 `remoteError`，本地仍展示；市场页 toast + 空态文案。
- `clearOutLocal` 与 `clearAuthStorage` 同一套三 key；`clearAuthSession` 不再分两次清。
- `ensureSkillSwitchHydrated` 启动 await；hydrate 期间用户改开关不覆盖；`setSkillSwitchStatus` await 写 config。
- HOST 表合并 H11/H26、H12/H27、H14/H29；H28 改为 `ensureSm4`。
- 实体迁 `jiaorong_src`：`legacyBrandAliases`、`appIdentity`、`slashMenuDisplayText`；原路径留 `export *`。不搬 CORS，不合并展示文案文件。
- 验证：既有 appIdentity / aliases / slashMenu 单测；确认 `brand/index.ts` 不 re-export 带 fs 的 appIdentity。
- KB：`ensureJiaorongKnowledgeBaseMcpServer` 失败返回 `{ ok: false }`，发送路径已有 toast。
- 技能详情 API：`getSkillDetail` 走 `readAuthApiData` / `isAuthApiSuccessCode`。
- Deeplink：`hasDeeplinkPrefix` 按小写比较；argv `JiaorongChat://` 能进 `findDeepLinkArg`。
- 手删技能：`getAllSkills`/`getMetadataList`/`readSkillFile` 丢掉物理路径已不存在的用户技能；目录级 watcher delete 踢缓存；市场列表 prune `remoteInstallMap`，不伪造 `skillRoot`；详情读盘失败回未安装。
- 详情安装态：`isSkillInstalledAsync` 改走 `getAllSkills`（与市场列表一致），不要用会过滤未分配技能的 `getMetadataList`；lookup 含市场名、本地目录名、`remoteInstallMap`。
- 主窗口 / 设置窗 / 两处浮窗 `webSecurity: false`（知识库列表/技能 zip 跨域）；`ensureJiaorongPrivateApiCors` 仍装。不改 Copilot OAuth / remote 窗。
- 新会话项目触发器：无选中路径时文案/图标按「聊天」（对齐 DeepChat）。不改 `common.project.select` 词条；发送仍只在用户点过「聊天」时把 `projectDir` 置 null。
- 设置默认页：非管理员 `getDefaultSettingsRouteName()` → `settings-common`；`/` 与 overview/dashboard 落地拦到通用。管理员仍概览。不改白名单号码。不把其它隐藏页（模型/MCP 等）一律重定向，以免冲掉 deeplink。
