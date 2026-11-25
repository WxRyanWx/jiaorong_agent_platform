# 开放平台技能 / 连接器包校验统一（plan）

## 现状

```
AssetPane.choosePackage
  └─ parsePackage(file)
      ├─ parseSkillPackage   (parseOpenPlatformPackage.ts:125)
      └─ parseConnectorPackage (:148)
          ├─ unzipRootFile  —— fflate filter: name === 'SKILL.md' 严格相等
          └─ readRootText
```

问题点：

| 位置 | 问题 |
| --- | --- |
| `unzipRootFile` filter | 严格字符串相等，`x\\SKILL.md`、`skill.md` 均匹配不上 |
| `parseSkillPackage` | 只判 `if (!name)`，不校验命名规则与长度 |
| `parseConnectorPackage` | id 无合法性校验；无路径安全校验 |
| 两者 | 均不做条目路径安全扫描；fflate 异常未转换；文案硬编码 |

## 设计

新增 `src/jiaorong_src/open-platform/packages/packageRules.ts`，承载纯函数规则，解析器只做编排：

```ts
// 路径
normalizeEntryName(name: string): string      // \\ → /、去尾部 /、去 BOM
assertSafeEntryPath(name: string): void       // 反斜杠 / 绝对路径 / .. / 控制字符 → throw
findRootMarker(entries: string[], marker: string): string | null

// 命名
SKILL_NAME_PATTERN                            // /^[a-z0-9][a-z0-9._-]*$/
assertValidSkillName(name: string): void
assertValidConnectorId(id: string): void

// 解压
readZipEntries(bytes: Uint8Array): Record<string, Uint8Array>  // 包 fflate 异常 → 统一中文错误
```

### 数据流

```
choosePackage(file)
  └─ readZipEntries(bytes)            // 解析失败 → i18n 包损坏提示
      ├─ 逐条 normalizeEntryName + assertSafeEntryPath
      ├─ findRootMarker('SKILL.md')   // 归一化后比对，兼容大小写与反斜杠
      ├─ parseFrontmatter
      └─ assertValidSkillName(name)   // 与发布期服务端规则对齐
```

### 反斜杠处理策略

**只用于识别，不回写。** 判定到反斜杠条目时直接抛错并带出条目名，让用户重新打包 ——
因为包内容会真实落盘，静默改写会掩盖用户打包工具的问题。

大小写（`skill.md`）则相反：项目内 `installLocalSkill.ts:66` 已有 `canonicalizeSkillMdZipKey`
兼容策略，这里保持一致，识别为正解。

### 错误文案

新增 i18n 键（`routes.*`），至少 zh-CN / en-US：

| key | zh-CN |
| --- | --- |
| `openPlatformZipUnreadable` | 包解析失败，请检查文件是否为有效 zip |
| `openPlatformZipBackslashPath` | 包内路径不允许包含反斜杠（{name}），请用标准压缩工具重新打包 |
| `openPlatformZipUnsafePath` | 包内路径不安全（{name}） |
| `openPlatformZipMarkerMissing` | {marker} 必须位于 zip 根目录 |
| `openPlatformSkillNameInvalid` | 技能 name 不符合命名规则（{name}），仅允许小写字母、数字、点、下划线和连字符 |
| `openPlatformConnectorIdInvalid` | 连接器 id 不符合命名规则（{id}） |

### 兼容性

- 正常包解析结果完全不变（`{ name, displayName, description }` / 连接器同构）。
- 现有测试 `openPlatformMockAndPackage.test.ts` 的 3 个解析用例应原样通过。

## 受影响接口

| 文件 | 变更 |
| --- | --- |
| `packages/packageRules.ts` | 新增 |
| `packages/parseOpenPlatformPackage.ts` | 改用共享规则，错误文案走 i18n |
| `renderer/AssetPane.vue` | 解析器已抛中文文案，catch 分支简化 |
| `src/renderer/src/i18n/{zh-CN,en-US}/routes.json` | 新增文案键 |
| `test/renderer/open-platform/*` | 新增规则与边界用例 |

## 测试策略

在 `test/renderer/open-platform/openPlatformMockAndPackage.test.ts` 的 package parser 组内补充：

- 反斜杠条目 → 报反斜杠专用文案（断言不再出现「根目录必须包含」）
- `../escape.md`、`/etc/x` → 报路径不安全
- `name: Test_Skill` / 中文 name → 报命名规则
- 非 zip 字节 → 报解析失败且不含 `invalid zip`
- 小写 `skill.md` → 正常解析
- 仅子目录 `sub/SKILL.md` → 报根目录要求
- 连接器 id 非法 → 报错

## 风险

- 收紧 name 规则后，历史上能创建成功的非法 name 包会改为创建阶段即失败。
  这是期望行为（提前暴露），但需在发布说明中提示。
