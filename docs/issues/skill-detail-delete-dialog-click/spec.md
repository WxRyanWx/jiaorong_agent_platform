# skill-detail-delete-dialog-click

## Goal

技能详情页删除确认框中「取消」「删除」可正常点击。

## Acceptance

- 打开删除确认后，取消可关闭且不卸载
- 确认删除可执行卸载
- 按钮在 Electron 窗口下可点击（不受 drag region 影响）
- 遮罩仅覆盖详情页区域，不盖住侧栏/顶栏；透明度与原先 `bg-black/80` 一致

## Non-goals

- 不改卸载 API / 业务逻辑
