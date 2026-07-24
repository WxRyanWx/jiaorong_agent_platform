# Plan

1. 自绘侧栏入口 SVG → `jiaorong_src/assets/skill-market-menu.svg`；`JiaorongSidebarItem.iconSrc` + `skills/module.ts`；`WindowSideBar` 有 `iconSrc` 时渲染 `<img>`
2. `SkillListPage`：搜索左图标、placeholder、卡片 `skill.png`、已停用=`!isSkillSwitchOn`
3. `SkillUploadDialog`：按稿重写 UI，保留 `installFrom*` 逻辑
4. 登记 HOST_TOUCHPOINTS；format / typecheck:web
