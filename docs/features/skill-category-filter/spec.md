# 技能市场分类筛选

## 用户故事

作为用户，我希望在技能市场按分类筛选技能，以便快速找到目标技能。

## 验收

- 筛选栏与匹配已迁到接口驱动：见 `docs/features/skill-category-from-api`
- 展示 `categoryName`，匹配 `categoryId === 分类 id`
- 内置技能用 name→id 映射；无映射项仅在「全部」出现

## 非目标

- 不改开源宿主 SkillMetadata 类型
- ~~固定写死 5 类~~（已废弃）
- ~~按 tagList 文案匹配~~（已废弃，改 categoryId）
