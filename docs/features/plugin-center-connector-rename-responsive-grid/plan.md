# 实施方案

## 文案

- `routes.pluginCenterMcp`：zh-CN 由「MCP」改为「连接器」，其余语种已是 Connectors 语义，保持不变。
- 新增插件中心专用键：`pluginCenterMcpPageTitle`、`pluginCenterMcpSearch`、`pluginCenterMcpAdd`，全部语种对齐。
- `McpSettings.vue` 增加 `copyScope` 属性：插件中心壳传 `plugin-center`，标题 / 新增按钮 / 搜索占位改用 `routes.pluginCenterMcp*`；设置窗口不传，继续使用原 `settings.mcp.center.*`，避免影响设置页。
- `McpServers.vue` 增加可选 `searchPlaceholder` 属性，由宿主决定搜索占位文案。

## 布局

- 新增共享 mixin `src/jiaorong_src/plugins/styles/plugin-center-list-layout.less`，四页共用：
  - `plugin-center-card-list()`：列表外层声明 `container-type: inline-size` 与 `container-name: plugin-center-list`。
  - `plugin-center-card-grid(@gap)`：默认 3 列，容器 ≤ 829px 降为 2 列，≤ 539px 降为 1 列（约 260px 卡片最小可用宽度）。
  - `plugin-center-search-field()`：`flex: 1 1 240px`、`min-width: 120px`、`max-width: 360px`，配合父级 `flex-wrap` 在空间不足 120px 时换行。
  - `plugin-center-search-input()`：高 36、左内边距 36、圆角 8、字号 13，四页输入框外观一致。
  - `plugin-center-add-button()`：「新增」按钮统一为 14px / 500 / 36 高 / 最小宽 118 / 圆角 8，用 `!important` 压过图标相关的 `has-[>svg]:px-*`。
  - `plugin-center-segment()`：筛选 tab 统一为 13px / 行高 18 / 高 32 / 左右内边距 18 / 胶囊圆角，含 hover 与 `is-active` 状态。
- 技能页 `.skill-center-page`、交融应用页 `.app-center-page` 声明容器，网格改用 mixin。
- IM 页（`PluginsCatalogPage.vue`）列表外层声明容器，网格由 `grid md:grid-cols-3` 改为 mixin 类。
- 连接器页（`McpServers.vue`）列表外层声明容器，网格由 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` 改为 mixin 类，间距由 12px 统一为 16px。
- 连接器页筛选按钮由 `DcButton` 改为原生 `button` + `plugin-center-segment()`，去掉固定 62/75px 宽与 `#5C78A0`/`#F1F5FA` 配色，与其余三页一致（文字宽度自然接近原固定值）。

## 兼容性

- 文案键新增只增不改语义，旧键继续服务设置窗口。
- 容器查询依赖 Chromium 105+，当前 Electron 41 满足。
- 四页样式均为全局 LESS 或 scoped LESS，mixin 通过相对路径引入，不新增构建配置。

## 测试策略

- 渲染层：`pnpm exec vitest run test/renderer/components test/renderer/jiaorong` 中与插件中心相关用例。
- 静态：`pnpm run format`、`pnpm run i18n:validate`、`pnpm run i18n:types`、`pnpm run lint`、`pnpm run typecheck:web`。
- 手动：拖动窗口从宽到窄，确认四页列数同步为 3 → 2 → 1、搜索框宽度一致并在窄屏换行，且连接器页菜单 / 标题 / 新增 / 搜索均为「连接器」。
