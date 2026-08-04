# 方案

## 根因

`mergeSkillMarketCatalog` 同名时本地整卡覆盖远程，丢掉 `metadata.remoteId` / `downloadUrl`。
返回列表 `openDetail` 把无远程字段的卡写入 session → 详情再装报缺下载地址。

非类型缺失问题。

## 改动

1. `mergeSkillMarketCatalog`：本地覆盖时保留远程 `remoteId`/`downloadUrl`/`displayName`。
2. 列表 enrich：显式保留上述字段。
3. 详情：`getSkillDetail` 映射 `downloadUrl`；安装优先 session，回退详情接口；卸载后 session 清本地态但保留远程字段。
4. 单测：同名合并保留远程字段。
