# Tasks

- [x] 编写 spec / plan / tasks
- [x] 实现 `jiaorong_staging/attachmentPreprocess`
- [x] `processMessage` 最小钩子
- [x] 单测（基础）
- [x] 历史 metadata 持久化 + contextBuilder 一行 rehydrate
- [x] preprocess 后去掉 vision reserve 双计
- [x] vision 流 AbortSignal（stream.return）+ preprocess activeGeneration
- [x] 无 final text 不回落 CoT；未知默认 VL 则跳过
- [x] 读盘大小上限
- [x] 同名图按 index 匹配；retry 复用 metadata；abort race；纯图 retry；activeGen 窗口
- [x] runStream 前再检查 abort；persist 仅 index；无 VL/失败图写入降级提示
- [x] pending 延后到最终 abort 后；不可读图进 skipped；失败/跳过落 metadata
- [x] 补测 + format
