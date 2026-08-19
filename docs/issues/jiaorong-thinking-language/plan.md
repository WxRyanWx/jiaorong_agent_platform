# 计划

- `SYSTEM_PROMPT_LANGUAGE_TAIL`：判定源改为「用户亲手输入」；排除 checkpoint / 前置技能 / MCP。
- `hostPromptLocalize`：补短 YoBrowser 句；本地化 Multi-Agent Orchestration Policy。
- `renderMessageActiveTurnSkillContext`：中文头 + 「技能正文不是用户语言」。
- `contextBuilder` 拼用户消息：前置材料与用户正文之间插入 `USER_LANGUAGE_TURN_SEPARATOR`。
- ACP 早退路径也对 `prompt` 做 `finalizeJiaorongSystemPrompt`。
- 测：finalize 单测、systemPromptBuilder ACP/编排、contextBuilder 分隔符。
