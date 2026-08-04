# skill-market-list-ui

## Goal

按 UI 设计稿一比一还原技能市场列表页与上传弹窗；技能卡片统一用 `skill.png`；侧栏进技能市场入口图标按设计自绘。

## Acceptance

- 列表：Tab、搜索（左图标 + 稿面 placeholder）、分类 pill、「+ 新建技能」下拉、卡片 logo=`skill.png`、按钮态安装/使用/已停用
- 上传弹窗：标题「上传技能」、大 `+` 拖拽区、取消/确认上传；安装逻辑不变
- 侧栏入口：自绘三星图标，不是 `skill.png` / `lucide:wand-sparkles`

## Non-goals

- 「安装中...」态（远程安装未接）
- 详情页 UI 精修
- 远程市场真实安装流

## Constraints

- 主改 `src/jiaorong_src/**`；侧栏若需 `iconSrc` 允许 `WindowSideBar` 极小触点并登记 HOST_TOUCHPOINTS
