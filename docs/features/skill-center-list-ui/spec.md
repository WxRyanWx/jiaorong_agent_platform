# skill-center-list-ui

## Goal

按原型实现技能中心列表页（本地已发现/内置技能），并统一 `jiaorong_src` 路由出口。

## Acceptance

- SkillListPage：市场/已安装 Tab、搜索、分类 pill、卡片网格；数据先来自本地 `skillsStore`（含启动时装入的内置技能）
- 安装/使用：本地已存在 →「使用」进详情；后续接口合并预留
- `@jiaorong/router`（`jiaorong_src/router/`）为私有路由唯一维护处；子模块不维护 routes
- 宿主 `router/index.ts` 只 `...createJiaorongRoutes()`

## Non-Goals

- 真实技能市场远程 API
- 精修设计稿像素级还原
- 创建/上传技能完整流程
