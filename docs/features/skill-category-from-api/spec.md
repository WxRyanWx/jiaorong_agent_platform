# skill-category-from-api

## Goal

技能市场分类 pill 来自 `deepchat-ext/skillCategory/list`；筛选用分类 `id` 对齐技能列表的 `categoryId`。

## Acceptance

- 筛选栏 =「全部」+ 接口 `{ id, categoryName }[]`（展示 categoryName，选中用 id）
- 列表技能带 `categoryId`（写入 metadata）；命中：`metadata.categoryId === 选中 id`
- 内置技能无 categoryId 时，用本地 name→id 映射（如 `rd` / `office`）
- 接口失败时仅「全部」
- 仅改 `jiaorong_src` + 单测

## Sample

分类接口 data 项：`{ id: "legal", categoryName: "合约法务", ... }`  
列表筛选：`skill.categoryId === "legal"`（不比中文名）
