# Plan

## Approach

抽出纯函数 `resolveSkillTryPrompts`：从 `SKILL.md` 正文、session `metadata`、远程
`tryPrompts` 三路解析，YAML 非空优先。详情页 `skillTryPrompts` 改为调用该函数。

YAML 解析用已有依赖 `yaml`，只读 leading frontmatter，不改安装规范化路径。格式合法的
`SKILL.md` 安装时本就会原样保留 `metadata`。

## Affected interfaces

- `src/jiaorong_src/skills/lib/resolveSkillTryPrompts.ts`（新增）
- `src/jiaorong_src/skills/pages/SkillDetailPage/SkillDetailPage.vue`
- `docs/archives/skillhub-skill-admission-2026-08-13.docx`

## Data flow

```
readSkillMarkdown(SKILL.md)
        │
        ├─ metadata.tryPrompts / exampleTemplateList  非空 → 展示
        │
skill.metadata（发现结果 / session）
        │
        ├─ 同上，Markdown 未加载或 YAML 无该字段时
        │
getSkillDetail.exampleTemplateList
        │
        └─ 以上都空 → 不展示
```

## Compatibility

- 旧市场技能无 YAML 试一试：行为与现在一致，继续走远程接口。
- 自建技能只写 YAML：无需远程 `remoteId` 也能展示。
- `exampleTemplateList` 别名避免有人按后端字段名写 YAML。

## Test strategy

- 单测覆盖：YAML 优先、远程兜底、都空、空数组视为没有、别名、过滤空白项。
