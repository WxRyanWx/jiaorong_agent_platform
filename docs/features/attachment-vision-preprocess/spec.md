# Attachment vision preprocess (scheme 4)

## User Need

默认会话模型是纯文本（用户不可见、不可切换）。用户上传图片时模型看不见像素；部分文档附件抽字失败时也没有稳定补救。需要系统在发消息前静默预处理，会话模型保持不变。

## Goal

在发送给默认文本模型之前：

- 若会话模型无 vision，且本轮有图片：用 Agent `visionModel`（或临时默认配置）生成描述，写入本轮用户文本上下文。
- 非图片附件：抽字为空时写入明确失败提示（不静默吞掉）。
- 会话 `providerId` / `modelId` 不切换。
- 图片描述对**后续轮次**可重建（UI 仍只显示用户原文）。

实现放在临时目录 `src/main/jiaorong_staging/`，后续迁入交融私有目录；主仓仅保留最小钩子。

## Acceptance Criteria

- 会话模型 `vision === false` 且本轮有可用图片时，默认模型收到的用户文本包含图片描述块。
- 发送后立即展示用户消息与助手占位；多模态识图过程以 `reasoning_content` 流式展示，不阻塞空白页。
- UI 用户气泡保持原文；描述写入附件 `metadata`，历史重建时注入模型上下文。
- 会话模型已有 vision 时，不额外调用预处理（避免重复耗时）。
- 未配置可用 vision 目标（含默认 VL `isKnownModel === false`）时跳过识图，不抛错中断发送。
- 预处理失败时记录日志并继续发送原文（降级，不阻断对话）。
- 取消发送时能中断旁路 vision 流（AbortSignal + stream.return）。
- 主仓改动限于：`processMessage` 钩子、`contextBuilder` 一行 rehydrate 调用。

## Constraints

- 尽量不改开源主链路；逻辑集中在 `jiaorong_staging`。
- 复用现有 `resolveSessionVisionTarget`。
- 用户界面不展示模型切换；不把识图描述塞进用户气泡正文。

## Non-goals

- 不实现静默切换会话模型（方案 1）。
- 本切片不做上传即异步预解析缓存（方案 8）。
- 不接入外部 OCR/MCP 服务。
- 不修改渲染层上传 UI。
- 不在开源工具层硬拦截 `read`（仅 prompt + strip / 历史重建 strip）。

## Open Questions

- （已决）vision 来源：优先 Agent `visionModel`，否则默认 `jiaorong / jiaorong-qwen3-vl-32b-thinking`（可用环境变量覆盖）；若 `isKnownModel` 明确为 false 则跳过。
- （已决）描述持久化：`MessageFile.metadata.jiaorongVisionPreprocess`，UI text 不变。
- （已决）thinking 模型无 final text 时不回落 CoT（避免泄漏）；该图记为失败并继续。
