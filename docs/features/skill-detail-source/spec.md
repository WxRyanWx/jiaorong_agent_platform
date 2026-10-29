# 技能新旧来源标识（source）贯通技能市场与详情页

## 用户需求

技能市场进入技能详情的链路要带上「新旧标识」字段 `source`：

- `open-platform`：开放平台发布的新技能
- `legacy`：旧技能市场迁入的存量技能

字段取值来自技能市场列表（`GET /deepchat-ext/assets?type=skill&scope=market`
的列表项 `source`），不是详情页自己再猜。

## 背景与实测

测试服（`http://106.63.7.106:10001/api/deepchat-ext`，2026-10-28）实测：

- `assets?type=skill&scope=market` 22 条，`source` 分布为
  `open-platform` 2 条 / `legacy` 20 条，字段已稳定返回。
- 旧详情接口 `GET /skill/{id}` 只对 `legacy` 有效（`s38`、`s63` 返回
  `exampleTemplateList` 等富信息）；对 `open-platform` 的 id
  （`dev-god`、`open-platform-report-skill`）一律返回
  `{"code":500,"message":"技能不存在"}`。
- `assets?type=app` 的 `source` 是另一套取值（`builtin` / `store`），
  与技能 / 连接器的 `open-platform` / `legacy` 不同域。

因此客户端当前对每条开放平台技能都会打一次注定失败的详情请求。

## 目标

1. 市场列表项的 `source` 一路透传到技能详情页，并写回 session。
2. 详情页按 `source` 决定是否调用旧详情接口：`legacy` 调用，`open-platform` 跳过。
3. 本地包 `SKILL.md` 的 frontmatter 不得覆盖远程 `source`。

## 验收标准

- 市场卡片 metadata 带 `source`，与接口返回一致。
- 已安装技能（本地目录名与市场展示名不同）合并后仍带远程 `source`。
- 打开 `legacy` 技能详情：仍拉旧接口，`tryPrompts` 正常。
- 打开 `open-platform` 技能详情：不再发起旧接口请求，名称 / 描述 / 安装
  按钮 / 卸载按钮行为不变。
- `source` 缺失（老 session、深链）时退回原行为，照常尝试旧接口。

## 约束

- 私有代码写在 `src/jiaorong_src`，不动上游主进程逻辑。
- `src/jiaorong_src/skills/**` 不得反向依赖 `open-platform` 目录，
  开放平台目录迁走后技能市场与详情页仍可用。
- 字段名在 `OpenPlatformAssetSummary` 上叫 `assetSource`：
  该类型已被 `OpenPlatformAppAssetSummary` 用 `source: 'builtin' | 'store'`
  交叉扩展，再加同名 `source` 会收窄成 `never`。

## 非目标

- 不在 UI 上展示「新 / 旧」徽标。
- 不改连接器与应用的来源语义（连接器 `source` 恒为 `open-platform`，
  应用 `source` 是 `builtin` / `store`）。
- 不修后端 `GET /skill/{id}` 对开放平台技能返回 500 的问题，
  只记进 `docs/open-platform-backend-issues.md`。

## 开放问题

无。
