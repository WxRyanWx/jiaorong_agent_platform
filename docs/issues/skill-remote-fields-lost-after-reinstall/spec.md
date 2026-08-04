# 详情卸载后再装丢失 remoteId/downloadUrl

## 用户需要

详情安装 → 返回列表 → 再进详情 → 卸载 → 再安装，应仍能安装。

## 目标

市场远程字段 `remoteId` / `downloadUrl` 在「本地已安装同名合并」后仍保留，详情可据此再装。

## 验收标准

1. 同名远程+本地合并后，卡片 metadata 仍含 remoteId、downloadUrl。
2. 上述用户路径再装成功（有下载地址）。
3. 非同名（展示名≠slug）路径不回归。

## 约束

- `SkillMetadata.metadata` 已是 `Record<string, unknown>`，不必改宿主类型。
- 同名仍以本地 path/skillRoot/描述为准，只合并保留远程市场字段。

## 非目标

- 不改安装 zip 工具本身。

## 开放问题

无。
