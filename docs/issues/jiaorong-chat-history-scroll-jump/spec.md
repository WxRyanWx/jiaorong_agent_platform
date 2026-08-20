# 聊天详情上滑回跳（对照上游 dev）

## 目标

上滑丝滑、不回跳。最后一条下面不能出现大片空白。知识库保留。

## 根因

历史消息滚近时高度变矮，浏览器把 `scrollTop` 钳回底部。两条会一起触发：

1. 列表开着 markdown 虚拟化时，`defer-nodes-until-visible` / `viewport-priority` 先占位，滚近再换成真行高。
2. 关掉虚拟化后 `max-live-nodes=0` 仍开着 `batch-rendering`，markstream 用高占位增量挂载，滚近后同样变矮。

## 做法

- 聊天列表关闭 markdown 虚拟化。
- 已结束消息 `batch-rendering=false`；流式仍批量。
- 思考块首屏收起，共用一次 `think_collapse`；收起不解析正文。
- 上滑不 `return-to-bottom`。

不要用列表 `min-height` 锁高度（最后一条下面会留白）。不要改预取阈值、滚动中 overflow-anchor、非窗口化锚定。
