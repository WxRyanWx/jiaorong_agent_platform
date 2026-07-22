# jiaorong_staging（临时）

交融私有目录（`src/jiaorong_src`）尚未合入本分支前，产品逻辑暂放此处。

## 迁移

1. 将本目录内容迁到 `src/jiaorong_src/...`（或 `@jiaorong/...`）
2. 修改 `agentRuntimePresenter` 中的 import 一行
3. 删除本目录
4. 在私有侧 `HOST_TOUCHPOINTS.md` 登记主仓钩子

## 当前模块

- `attachmentPreprocess/`：方案 4——无 vision 会话模型下，发消息前用旁路多模态描述图片，再交给默认文本模型
