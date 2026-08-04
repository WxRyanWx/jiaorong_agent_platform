# jiaorong-host-thinning-p1

## Goal

继续削宿主触点：侧栏技能入口改 registry、auth 宿主入口收敛、品牌常量集中。

## Acceptance

1. WindowSideBar 技能按钮来自 `listJiaorongSidebarItems()`，无硬编码业务文案/路由名散落（导航仍可走 item.routeName）
2. 宿主 auth 相关 import 统一走 `@jiaorong/auth/host`（或等价薄入口）
3. 主进程/渲染关键品牌字符串来自 `@jiaorong/brand`
4. HOST_TOUCHPOINTS 更新；既有侧栏/登录行为不变

## Non-Goals

- 迁提示词设置页 / deeplinkPresenter 整文件
- 全量 i18n / package.json 品牌替换
- 改技能中心页面本身

## Constraints

- 侧栏入口须在 idle `mountJiaorong` 之前可见 → 用同步 `listJiaorongSidebarItems`，不依赖 mount
- 不跑全仓 format
