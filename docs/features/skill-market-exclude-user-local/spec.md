# skill-market-exclude-user-local

## Goal

技能市场 Tab 仅展示：远程接口技能 + 14 个系统内置技能。用户上传 / 自行创建的本地技能不再出现在市场列表中（仍可在「已安装」中看到）。

## Acceptance

- 市场 Tab / `marketCount`：仅 remote（含 `remoteId` / RemoteApi）与 `BUILTIN_SKILL_NAMES` 十四项
- 已安装 Tab：仍包含已安装的上传/自建技能
- 搜索与分类在上述集合内过滤

## Non-goals

- 不改远程安装/卸载流程
- 不改默认市场预装清单

## Constraints

- 主改 `src/jiaorong_src/**`
