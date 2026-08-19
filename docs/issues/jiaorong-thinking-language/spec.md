# 思考语言跟用户问题，不跟技能/MCP

## 目标

中文用户提问时，【思考过程】用中文。技能、MCP、检查点、记忆、工具 schema 即使是英文，也不是语言判定源。

## 背景

master 把语言尾注贴在系统提示最末尾，且 summary/handoff 也在系统段里。上游改成：检查点独立 `role=user`，本轮技能/记忆贴到当前用户消息前面。语言尾注仍写「只看 role=user」，模型把英文技能当作用户语言。

## 验收

1. 语言尾注写明：只看用户亲手输入；检查点/技能/MCP/记忆不是判定源。
2. 本轮技能头与 Runtime YoBrowser 句可被本地化；编排策略段 finalize 后为中文标题。
3. 用户消息在前置材料与用户正文之间有语言判定分隔。
4. ACP 子会话系统提示也走 finalize。

## 非目标

- 不改 compaction/checkpoint 的 role 与哈希结构。
- 不翻译 SKILL.md / MCP schema 正文。
- 不改 defaults.ts apiKey。
