# 技能 YAML 试一试字段

## User Need

自建技能上架 SkillHub 时，「试一试」目前只存在后端表（详情接口
`exampleTemplateList`）。创作者希望把试一试写进 `SKILL.md` 的 YAML 头，安装后也能展示；
已上架、只在后端存了试一试的技能仍要兼容。

## Goal

详情页「试一试」按以下优先级取值：

1. 已安装技能 `SKILL.md` YAML（`metadata.tryPrompts`）有内容 → 用 YAML
2. 否则用远程详情接口 `exampleTemplateList`
3. 都没有 → 不展示「试一试」区域

## Acceptance Criteria

- YAML `metadata.tryPrompts` 为非空字符串数组时，详情页优先展示这些提示词。
- YAML 无该字段或为空时，回退远程接口；远程也为空则不渲染试一试区块。
- 兼容别名 `metadata.exampleTemplateList`（与后端字段同名）。
- 未安装技能仍不展示试一试（现有行为不变）。
- 准入文档 YAML 头列出当前技能全部可填写字段，并在 `metadata` 中包含试一试。

## Constraints

- 新逻辑放在 `src/jiaorong_src`，不改开源 SkillPresenter 的 frontmatter 解析。
- `metadata` 本就会透传到 `SkillMetadata.metadata`，无需新增宿主字段。
- 用户可见文案不新增；试一试区域沿用现有 i18n。

## Non-goals

- 不把 YAML 试一试回写到后端表。
- 不改技能编辑器表单。
- 不合并 YAML 与远程两套问题（有 YAML 就整份采用）。
