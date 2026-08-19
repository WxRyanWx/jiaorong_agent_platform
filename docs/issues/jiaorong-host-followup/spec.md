# 宿主跟进：启动日志类型 / Linux 双协议 / 技能文案 / 审查修补

## 目标

1. `tape_bootstrap_backfill` 纳入 `MainLogStartupComponent`，typecheck:node 通过。
2. Linux 启动脚本同时注册 `jiaorongchat://` 与 `deepchat://`。
3. 用户可见技能正文/描述里的产品名 DeepChat → JiaorongAI。CLI 命令仍是 `deepchat`；`deepchatFeature` 等协议字段不改。
4. 内置 CLI 技能 id：`deepchat-cli` → `jiaorong-cli`。命令仍 `deepchat`；家目录 `~/.jiaorongchat` 不是 CLI 发现路径。
5. 技能市场远程失败要有可见错误，不能静默成「暂无技能」。
6. 登录态清理只留一套（token + userInfo + userFullInfo）。
7. 技能开关以主进程 config 为准：启动完成 hydrate 后再给 UI 过滤；写入时 await 持久化。
8. HOST 表去掉重复/过期条目（H13 vs H28，H11/H26 等）。
9. 把「纯 Jiaorong、宿主只 re-export」的模块实体迁进 `jiaorong_src`：别名表、appIdentity、斜杠菜单展示文案。不合并文件、不改调用方 import。
10. 选中知识库后，MCP 服务启动失败则阻断发送，不能假装检索可用。
11. `getSkillDetail` 与列表一样校验鉴权 API 成功码，失败不当成有详情。
12. Windows 冷启动 argv 里 `JiaorongChat://` 大小写仍能识别为 deeplink。
13. 用户在 `~/.jiaorongchat/skills` 里手删技能目录后：已安装列表不再残留；详情走未安装（下载按钮），不再报 `Skill manifest is outside the physical Skill root`。
14. 主窗口 / 设置窗 / 浮窗暂关 `webSecurity`（技能 zip、知识库列表跨域）。CORS helper 保留。
15. 市场安装成功后列表显示「使用」、详情须同样视为已安装。检查安装态与列表共用 `getAllSkills`，并认市场名 / 本地目录名。
16. 新会话顶栏未选项目时显示「聊天」，不要占位「选择项目」。点开后仍是最近项目 / 打开文件夹。
17. 非管理员打开设置默认进通用设置，不能落在设置概览（侧栏该项本就隐藏）。

## 非目标

- 不改 defaults.ts apiKey。
- 不整文件改 CUA vendor Swift。
- 不改 `migrateLegacyAppHomeDir` 行为（只向用户说明）。
- 不改聊天上滑 H121。
- 不搬 `jiaorongPrivateApiCors.ts`（冲突在 window/index 的 import；文件本身含 electron，进私有目录要 nocheck）。
- 不把 `slashMenuDisplayText` 合并进 `toolDisplayNames`。
- 不改扫码正式服 URL、token 进 URL/磁盘/deeplink。
- 不改 zip 30s/200MB 超时与体积上限。跨域暂关 `webSecurity`（含知识库列表），不把 zip 改走主进程下载。
- 不改技能开关 hydrate 失败仍标成功（审查建议 1，只说明）。
