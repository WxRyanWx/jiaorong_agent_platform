# skill-detail-delete-confirm

## Goal

技能详情页所有已安装技能均可删除；删除前二次确认。

## Acceptance

- 删除按钮对所有已安装技能可用（含原 builtin 限制）
- 点击删除弹出确认框，取消不删除，确认后执行卸载
- 文案走 i18n

## Non-goals

- 不改卸载后端实现细节（除非宿主明确拦截 builtin）
