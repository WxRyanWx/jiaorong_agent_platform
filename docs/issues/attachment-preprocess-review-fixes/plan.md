# Plan

1. `processMessage`：记录 `preprocessGenerationRunId`，在 outer `catch`/`finally` 用该 runId `clearActiveGeneration`（stream 已换 runId 时为 no-op）。
2. `collectEmptyNonImageFiles` 返回带原数组 index 的项；`buildPersistableUserContent` 按 1-based index 打空附件标记。
3. 删除 `emitRefreshBeforeStream`（presenter + shared 类型 + retry 调用）。
4. 单测覆盖同名空附件；跑现有 preprocess 测试。
