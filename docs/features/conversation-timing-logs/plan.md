# Plan

私有旁路观测 Hooks + `chat.stream.*`，输出扁平 JSONL。

## Data shape

```json
{
  "sessionId": "...",
  "messageId": "...",
  "agentName": "...",
  "conversationTitle": "...",
  "turnPrompt": "...",
  "modelInputAt": "ISO-8601",
  "modelFirstOutputAt": "ISO-8601|null",
  "modelEndAt": "ISO-8601|null",
  "toolsStartAt": "ISO-8601|null",
  "toolsEndAt": "ISO-8601|null",
  "turnEndAt": "ISO-8601",
  "status": "completed"
}
```
