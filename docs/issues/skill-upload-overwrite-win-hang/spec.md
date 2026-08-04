# skill-upload-overwrite-win-hang

## Goal

修复 Windows 上手动上传文件夹技能时：同名覆盖弹两次、点覆盖后无报错停在上传弹窗的问题；不改变 Mac 覆盖路径与其它安装入口行为。

## Acceptance

- 首次同名仍只弹一次「技能已存在」确认。
- 点「覆盖」后不可并行触发第二次覆盖；进行中忽略重复点击。
- 覆盖安装仍返回 conflict / 失败时，必须 toast，不再二次弹出覆盖确认。
- Mac：仍不预卸载；无同名时上传、zip/md 上传行为不变。

## Non-goals

- 不改宿主 `SkillPresenter` 锁目录算法（另案增强）。
- 不改市场安装 / zip URL 安装流程。
