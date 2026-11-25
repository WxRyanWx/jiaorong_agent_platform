# 开放平台技能 / 连接器包校验统一（tasks）

- [x] 1. 新增 `packages/packageRules.ts`：路径归一化、路径安全断言、根标记查找、name 规则
- [x] 2. 新增 i18n 键（zh-CN / en-US 手写，其余 18 个 locale 按 en-US 回填）并跑 `pnpm run i18n`
- [x] 3. 改造 `parseSkillPackage` 使用共享规则，错误文案走 i18n
- [x] 4. 改造 `parseConnectorPackage`：补路径安全与 id 合法性校验
- [x] 5. `AssetPane.vue` 注入 i18n 文案（`createPackageMessages`）
- [x] 6. 补充 package parser 边界测试（反斜杠 / 穿越 / 非法 name / 非 zip / 小写 / 仅子目录 / 连接器 id）
- [x] 7. 跑 `oxfmt`、`pnpm run i18n`、`pnpm run lint`、`typecheck:web`、相关 vitest

## 验证结果

- `test/renderer/open-platform/` 全量：**163 passed / 14 files**
- `typecheck:web`：通过
- `pnpm run lint`：0 errors（36 warnings 均为既有文件）
- `oxfmt --check`：通过
- `pnpm run i18n`：本目标新增键 **0 缺失**；仅剩 `settings.mcp.serverStartFailedDesc` 的既有缺口（HEAD 上即存在，已在 stash 后复现确认）

## 遗留

- `settings.mcp.serverStartFailedDesc` 在 16 个 locale 缺失，属既有问题，不在本目标范围。


## 代码复核（第二轮）

首版实现复核出 4 个问题，已全部修复：

| # | 问题 | 修复 |
| --- | --- | --- |
| 1 | 0 字节 `SKILL.md` 报成「根目录没有 SKILL.md」，错误原因指向错误位置 | `readRootMarker` 区分 missing / isDirectory / empty 三种失败 |
| 2 | `readPackageEntries` 注释谎称「两段式 + filter」，实际是全量解压 | 注释改为如实描述，并写明代价（200MB 包约 30ms、内容整体驻留内存） |
| 3 | 目录项 `SKILL.md/` 归一化后被当成文件命中，掉进问题 1 的坑 | 目录项单独识别，命中文件时排除目录项 |
| 4 | `PACKAGE_NAME_MAX_LENGTH` 写死 64，与客户端真源不一致 | 改为复用 `@shared/types/skill` 的 `SKILL_NAME_MAX_LENGTH`（255） |

**问题 4 的判定依据**：name 就是资产 id，客户端在 `discoveryWorker` / `agentSkillImportService` /
`routingCatalog` / `toolResolver` / `agentToolManager` 等 10+ 处统一使用 255。
`validateDraftSkillDocument` 里的 64 是 skill-creator 草稿写入的工具链限制，不是资产 id 契约。

修复过程中类型检查又暴露出两处连带问题，一并修掉：

- 新增 `markerIsDirectory` / `markerEmpty` 文案键后，`AssetPane.createPackageMessages` 未同步补键（typecheck 报 TS2739）
- 目录项大小写比较写成了 `item.name === marker.toLowerCase()`，应为两侧都转小写

另追加：超长 name 在报错文案中只回显前 64 字符，避免 255+ 整串塞进 toast。

### 复核后验证

- `test/renderer/open-platform/`：**165 passed / 14 files**
- `typecheck:web`：通过
- `pnpm run lint`：0 errors
- `pnpm run i18n`：openPlatform 键 0 缺失

### 实测行为确认

| 输入 | 输出 |
| --- | --- |
| 0 字节 `SKILL.md` | 内容为空 |
| 目录项 `SKILL.md/` | 是目录 |
| 无标记文件 | 缺失 |
| 仅 `sub/SKILL.md` | 不在根目录，带出实际路径 |
| name 255 字符 | 通过 |
| name 256 字符 | name 不合规（回显截断至 64 字符） |
| 反斜杠 / 路径穿越 / 小写 `skill.md` / 连接器 id | 均符合预期 |


## 全量复核（第三轮）

### 发现并修复的回归

| # | 问题 | 严重度 | 修复 |
| --- | --- | --- | --- |
| 5 | **连接器 id 套用了技能命名规则**，导致中文连接器名无法创建 | 高（功能回归） | 撤掉该校验，只拦空值 |
| 6 | **全量解压无 zip 炸弹防护** | 中（内存/DoS） | 改用 `filter` 收集全部条目名，只解压标记文件 |

**问题 5 详情**：`docs/features/open-platform/spec.md` 的「连接器」一节明确写
「服务名同时作为技术 ID 和展示名，**可直接使用中文**」。我先前按技能规则校验连接器 id，
会把原本可用的中文连接器挡在创建阶段。更糟的是当时把既有测试里的 `我的连接器` 改成了
`my-connector`，等于用测试迁就错误实现。已恢复原断言，并新增「中文连接器名可用」用例。

**问题 6 详情**：全量解压会按**未压缩大小**占内存。实测 512KB 的包（512MB 零字节压缩而来）：

| 实现 | 耗时 | RSS 增量 | 解压内容 |
| --- | --- | --- | --- |
| 全量 `unzipSync(bytes)` | 742.9 ms | **+515 MB** | 全部条目 |
| `filter` 收集名字 | 0.4 ms | **+0 MB** | 仅 SKILL.md |

fflate 的 `filter` 回调对每个条目都会调用并带 `file.name`，因此既能拿到全量条目名做
路径校验，又只解压命中项——两个目标同时满足，不再需要全量解压。

### 复核后行为矩阵（实测）

| 输入 | 结果 |
| --- | --- |
| 正常 / 小写 `skill.md` / 混合大小写 | 通过 |
| 带 `__MACOSX/SKILL.md` 干扰 | 通过（不误判为根标记） |
| 空文件 / 目录项 / 缺失 / 仅子目录 | 分别为「为空 / 是目录 / 缺失 / 不在根」 |
| 反斜杠 / 路径穿越 / 绝对路径 | 分别准确报错 |
| name 非法 | 报命名规则 |
| 非 zip / 空 zip | 「无法解析」，不泄漏 fflate 英文原文 |
| 512MB 膨胀炸弹包 | 通过，0.4ms，内存无增长 |

### 其他复核项

- i18n 20 个语言文件仅追加键，无大规模重排（每个文件 +13/-1 行）
- `src/types/i18n.d.ts` 此前已落后于 JSON，重新生成补齐本轮 11 个键（另有 5 个既有遗漏一并修正）
- 清理：删除不再被调用的 `findRootMarker` / `findNestedMarker`、冗余 `BACKSLASH` 常量、
  未使用的 `connectorIdInvalid` 文案键（20 个语言同步删除）

### 最终验证

- `test/renderer/open-platform/`：**166 passed / 14 files**
- `typecheck:web`：通过
- `pnpm run lint`：0 errors
- `oxfmt --check`：通过
- `pnpm run i18n`：openPlatform 键 0 缺失


## 全量复核（第四轮）

### 本轮修复

| # | 问题 | 严重度 | 处理 |
| --- | --- | --- | --- |
| 7 | `zip -r pkg.zip .` 产生的 `./SKILL.md` 被误报「必须位于根目录，当前在 ./SKILL.md」 | 中（真实打包方式） | `normalizeEntryName` 只剥前导 `./`，中间段不动 |
| 8 | 两处注释仍称连接器套用命名规则，与实现不符 | 低（误导） | 更正为「仅技能」并注明连接器按契约允许中文 |

**问题 7 说明**：这不是本轮引入的回归（旧实现 `name === 'SKILL.md'` 同样匹配不上），
但它会让本轮的「准确报错」目标落空——文案说文件在 `./SKILL.md`，用户看着就像在根目录。
只剥前导 `./` 不碰中间段，因此 `./../x`、`.//../x`、`./a/../../x` 仍然全部被判为穿越。

### 对抗用例实测（修复后）

| 输入 | 结果 |
| --- | --- |
| `./SKILL.md` / `././SKILL.md` | 通过 |
| `./sub/SKILL.md` | 不在根目录（带出实际路径） |
| `./../escape.md` | 不安全 |
| `.//../escape.md` | 不安全 |
| `./a/../../x` | 不安全 |
| `a//SKILL.md` | 不在根目录 |
| `__MACOSX/SKILL.md`（唯一） | 不在根目录 |
| `a/b/c/SKILL.md` | 不在根目录 |
| 控制字符文件名 | 不安全 |
| 含空格 / Unicode 文件名 | 通过 |
| `...` / `.` 条目 | 通过 |
| CRLF frontmatter / BOM 开头 | 通过 |
| `name: MySkill` | name 不合规 |
| `description: ""` | 字段缺失 |

### 全量套件对照（排除误判）

`test/renderer/` 全量运行会大量 collection 失败。已在 **干净树（stash 后）** 复现，
两边结果完全一致（`333 failed`、`1 failed | 84 passed`），确认是沙箱内跑全量 renderer
套件的既有环境问题，与本次改动无关。改动涉及目录的定向测试全部通过。

### 最终验证

- `test/renderer/open-platform/`：**168 passed / 14 files**
- `typecheck:web`：通过
- `pnpm run lint`：0 errors
- `oxfmt --check`：通过
- `pnpm run i18n`：openPlatform 键 0 缺失
- 工作区无临时文件、无残留 stash

### 已知遗留（非本次改动引入）

- `createConnectorConfig` 内仍是硬编码中文文案（`stdio 连接器必须提供 command` 等），
  未纳入 i18n。属既有实现，改动会牵连现有测试，未在本轮处理。
- `settings.mcp.serverStartFailedDesc` 在 16 个 locale 缺失，`pnpm run i18n` 因此整体
  非零退出；已在 HEAD 上复现确认与本次无关。
