# 技能详情页自适应 — 改动说明

## 目标

主内容区变窄（窗口缩小或侧栏展开）时，详情页不横向溢出，区块可折行/降列，保持可读可点。

## 改动文件

- `src/jiaorong_src/skills/pages/SkillDetailPage/SkillDetailPage.vue`（仅 scoped less + 少量结构类名沿用）
- 规格目录：`docs/features/skill-detail-responsive/`

未改业务逻辑、路由、删除确认流程。

## 总体思路

不用视口 `media query`，改用 **CSS Container Query**，按**详情页自身宽度**响应。

原因：Electron 里真正变窄的是右侧主栏（侧栏占宽），不是整个窗口。用容器查询才能跟侧栏伸缩同步。

```less
.skill-detail-page {
  container-type: inline-size;
  container-name: skill-detail;
  // ...
}
```

断点写在同一作用域内，用 `@container skill-detail (...)`，保证选择器权重够盖住嵌套样式。

## 断点

| 内容区宽度 | 行为 |
| --- | --- |
| 默认（>720） | 试用提示 **3 列**；页边距 `20/32/30`；描述与按钮左缩进 `60px`（对齐图标） |
| `≤720` | 试用 **2 列**；边距收紧；描述/按钮 **取消 60px 缩进**；标题约 18px |
| `≤520` | 试用 **1 列**；标题区可换行；操作按钮可折行铺开；副标题单独一行；源码区 padding 再收 |

## 各模块具体改动

### 1. 页面壳

- 外层：`position: relative` + `overflow: hidden`（给删除蒙版用）
- 内层 `.skill-detail-page-scroll`：真正滚动；padding 随容器断点变化

### 2. 导航 / 面包屑

- `min-width: 0` + 面包屑 `ellipsis`，长技能名不再撑破顶栏
- 返回按钮 `flex-shrink: 0`

### 3. Hero（图标 / 标题 / 开关 / 操作）

- 顶栏由固定 `height: 44px` 改为 `min-height: 44px`，允许换行
- 标题区 `flex: 1; min-width: 0` + 单行省略
- 开关 `flex-shrink: 0`；禁用态标签色 `#86919c`
- 操作区改为 `flex-wrap` + `gap: 8px`（去掉按钮互相 `margin-left`）
- 窄屏：主行占满宽；按钮 `flex: 1 1 auto`，约两列折行

### 4. 试用提示网格

- 默认 `repeat(3, minmax(0, 1fr))`
- 720 → 2 列；520 → 1 列
- 卡片由固定 `height: 134px` 改为 `min-height` + 文案 `-webkit-line-clamp: 4`

### 5. 源码区

- 标题过长省略
- header / content padding 随断点减小
- 源码/预览继续 `pre-wrap` + `overflow-wrap`，避免横向撑破

### 6. 删除确认蒙版（同文件既有逻辑，顺带兼容）

- 蒙版仍只盖详情页（非全窗）
- 透明度用 `rgba(0, 0, 0, 0.8)`（Less 会把 `rgb(... / 80%)` 的 `/` 当除法，以前会变成纯黑）
- 弹层 shadow 同样改为 `rgba(...)`

## 怎么自测

1. 打开任意已安装技能详情页
2. 拖窄窗口，或展开侧栏挤窄主内容区
3. 观察：
   - 试用卡是否 3 → 2 → 1 列
   - 描述/按钮是否在中窄宽下去掉大左缩进
   - 长标题/面包屑是否省略而不是溢出
   - 删除蒙版仍只盖详情区，且半透明

## 非目标（这次没做）

- 列表页自适应
- 独立手机端信息架构重排
- 改卸载 API / 确认文案逻辑
