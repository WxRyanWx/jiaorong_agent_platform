# jiaorong-knowledge-base-picker

## Goal

对话输入框「+」旁增加知识库选择按钮与弹窗：可选知识库/文件夹/文件，回显为 chips；发送时暂不调 MCP。

## Acceptance

- 按钮 logo：`jiaorong_src/assets/knowledge.png`，位于附件按钮旁。
- 弹窗：个人/共享列表（POST `knowledge-base/query`，type 1/2，搜索字段 `name`）。
- 进入目录：POST `knowledge-base/queryDirectory`（`directoryId`，搜索字段 `fileName`），可继续下探文件夹。
- 图标：`/api/sys-storage/download?f8s=${icon}`（对齐 chat-web）；无 icon 用默认图。
- 目录/文件按类型显示图标（folder/word/excel/pdf/ppt/txt）。
- 「字符数」列展示文件大小；文件夹为 `-`。
- 多选混合；弹窗内切换 tab/下探保持选中；确认后 chips 回显；chip 删除与弹窗状态同步。
- 选中集合按会话（A）；清空点与 `attachedFiles = []` 一致。
- **优先级**：业务正确与性能优先；私有目录尽量沉淀 API/弹窗/选择状态，宿主挂载走开源页面直连，不为隔离而引入 alias 包装层。
- 输入框上方选中区（附件 + 知识库 chips）超出最大高度时内部滚动，不把编辑器挤出视口。

## Non-goals

- 改侧栏知识库 iframe 模块。

> 发送时调用知识库 MCP：见 `docs/features/jiaorong-knowledge-base-mcp/`。
