# Plan

1. 新增 `knowledgeBase/mcp/knowledgeBaseMcpInstructions.ts`：server 描述 + 选中后给模型的调用约束与参数模板。
2. `ensureKnowledgeBaseMcpServer` 的 `descriptions` 引用该配置。
3. `prepareKnowledgeBaseSendFiles` 的合成文件 content 引用该配置。
4. 单测覆盖提示含「必须先调用 / 禁止编造」与 arguments。
