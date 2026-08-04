# 计划

1. 文案与 Skills 中文说明放在 `@jiaorong/prompts/*`（私有目录）。
2. 宿主 `agentRuntimePresenter` 仅 import 接线（H42）。
3. `finalizeJiaorongSystemPrompt` 必须在 summary / tape handoff **之后**调用，保证语言尾注真正在最后。
4. 单测覆盖幂等与顺序。
