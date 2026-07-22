# Attachment preprocess review fixes

## User Need

合入前消除 code review 指出的可靠性与持久化边界问题。

## Goal

- preprocess 成功后、stream 登记前若出错，不得泄漏 `activeGeneration`
- 空附件 metadata 按文件下标标记，同名文件不误伤
- 删除已无效果的 `emitRefreshBeforeStream`

## Acceptance Criteria

- `processMessage` 在未进入 / 未完成 stream 接管时，失败或 abort 后 `activeGenerations` 无残留 preprocess run
- 同名空/非空文档仅空者带 `jiaorongEmptyAttachment`
- 接口与调用点不再出现 `emitRefreshBeforeStream`

## Constraints

- 逻辑仍集中在现有 staging + 最小 host 钩子
- 保持 preprocess 期间 Stop 可用（成功路径仍由 stream register 覆盖）

## Non-goals

- 不改文档内嵌图 / 文档解析服务
- 不清理全部死代码（onDelta 等可后续）
