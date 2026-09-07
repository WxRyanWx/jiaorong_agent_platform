# 实现

- 宿主 `catalog.slash`：扫应用 `skill/*/SKILL.md`，合并 `skillService.getAllSkills`、`mcpService.getAllToolDefinitions` 与 `snapshotCachedToolDefinitions`，中文 label 在宿主算好。
- kit `JiaorongChatSlashMenu` 叠在输入框上；`JiaorongChatSender` 识别 `/` 查询、键盘上下确认；空查询返回全部条目。
- 发送带 `activeSkills`；创建/续写都走现有 session 字段。
- 最近项目走 `dialog.allowProjectDir`，路径去尾斜杠后才能写入 `projectDir` 并归入工作区。
- 侧栏搜索只过滤当前列表标题；顶栏改名走 `session.rename`；主动协作用底部小弹窗。
- 置顶只信宿主 `isPinned`，不要本地 overlay。
- 切会话必须清掉 `loadingHistory` / 上滑锁；pending 用户气泡按本轮文本+时间对齐。
- 生成中侧栏显示 working；有字回车走 `session.steer`。
- 创建成功前保持落地页；Chat2 对 `messages.changed` 做 upsert。
