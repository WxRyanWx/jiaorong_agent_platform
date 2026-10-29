# 开放平台真实接口接入（plan）

## 实现思路

保持 `OpenPlatformClient` 契约不变，新增一份 http 实现并把它设为默认 client。
页面与插件中心通过 `getOpenPlatformClient()` 取用，切换后无感。
契约只做三处必要扩展：`listSkills` 补 `scope`、发布入参补真实包体、
新增 `republish*`（后端有独立 action，且不需要重新上传制品）。

## 接口映射

| client 方法 | HTTP |
|---|---|
| `listApps(scope)` | `GET assets?type=app&scope={scope}` |
| `publishApp(input)` | `POST assets/app/publish`（`id?` + `manifest` + `file`） |
| `unpublishApp(id)` / `removeApp(id)` | `POST assets/actions` |
| `listSkills(scope)` | `GET assets?type=skill&scope={scope}` |
| `createSkill(input)` | `POST assets/draft`（`type=skill` + `manifest`） |
| `publishSkill(input)` | `POST assets/publish`（`type` + `id` + `version` + `file`） |
| `republishSkill(id)` / `unpublishSkill(id)` / `removeSkill(id)` | `POST assets/actions` |
| `listConnectors(scope)` | `GET assets?type=connector&scope={scope}` |
| `createConnector(input)` | `POST assets/draft`（`type=connector` + `manifest`） |
| `publishConnector(input)` | `POST assets/publish` |
| `republishConnector(id)` / `unpublishConnector(id)` / `removeConnector(id)` | `POST assets/actions` |

路径统一带 `deepchat-ext/` 前缀（axios `baseURL` 已含 `/api`），
与 `api/skills`、`api/knowledgeBase` 现有写法一致。

## 数据流

```
AssetPane 选 zip → parseOpenPlatformPackage（前端预检）
                 → createConnector/createSkill（POST /assets/draft，只送 manifest）
                 → 暂存 File 到 pendingPackages[id]
                 → 填组织 + 版本号 → publishSkill/publishConnector（POST /assets/publish，带 File）

AppsPane 选 zip → peekZip 回填表单 → publishDevApp（主进程校验 + 回写 app.json）
                → 返回 zipBase64 → Blob → publishApp（POST /assets/app/publish）

插件中心 → listConnectors('market') / listSkills('market') / listApps('market')
        → 全量分页快照 → 既有映射与对账逻辑

安装（技能）→ downloadUrl（私有源）→ 渲染进程 fetch + resolveJiaorongPrivateApiHeaders
           → installSkillFromZipBytesCompat
安装（应用）→ IPC installAppCenterRemotePackage(appId, downloadUrl, sha256)
           → 主进程 downloadAppZip（带鉴权头）→ sha256 校验
           → sharedAppsManager().installAppFromPackage → 删临时包
```

## 受影响接口

- `api/openPlatform/types.ts`
  - `listSkills(scope: OpenPlatformScope)`
  - 三个 PublishInput 增加 `package?: OpenPlatformPackageBlob`
  - 新增 `republishSkill` / `republishConnector`
  - `OpenPlatformAppAssetSummary.source` 保持 `'builtin' | 'store'` 窄枚举，
    映射层把认不出的值归一到 `store`，避免后端加值时前端类型失真
  - `latestRelease` 允许 `null`（草稿态后端就是 null），映射层统一收敛
- `api/openPlatform/index.ts`：默认 client 换成 `createHttpOpenPlatformClient()`
- `appHost/types.ts`：`JiaorongAppCenterItem` 增加可选 `downloadUrl` / `packageSha256`
- `DevCenterMutationResult`：增加可选 `zipBase64`

## 兼容性

- mock client 保留，单测继续用 `setOpenPlatformClient` 注入替身。
- `isMockOpenPlatformClient` / `getOpenPlatformMockAppPackagePath` 仅在 mock 分支生效，
  http client 下 `localPackagePath` 恒为 null、`remotePackage` 按 `downloadUrl` 判定。
- `latestRelease` 保持后端原样（草稿态就是 `null`），消费端用可选链取
  `downloadUrl` / `sha256`，取不到就退化成「无远端包」，不伪造零值对象。
- 旧本地 MCP 配置无 `sourceVersion`：沿用 `isNewerOpenPlatformVersion` 的既有兜底。
- 应用远端包由主进程下载：zip 可能上百 MB，走渲染进程再 base64 回传主进程
  会把内存和 IPC 都打爆；主进程本来就有 `downloadAppZip` 与包安装器，直接复用。

## 关键取舍

1. **发布必须带真实文件**：后端 `/assets/publish` 强制 `file`，且会从包内
   重新解析 `name` / `description` / `config`（实测 publish 后 description 被包内值覆盖）。
   所以 `AssetPane` 必须把 `File` 留到发布时刻；草稿在页面刷新后丢失 File，
   发布按钮改为先弹文件选择器补齐，再提交。
2. **重新上架走 action 而不是 publish**：`republish` 不需要制品，天然满足
   「沿用原版本号」，也避免前端为了恢复可见性再逼用户选一次 zip。
3. **版本递增前端预检**：后端只对应用校验递增，技能 / 连接器不校验，
   前端在提交新制品前用 `isNewerOpenPlatformVersion` 拦一道，
   同时把「后端应补校验」记进后端问题清单。
4. **应用 zip 走主进程 base64**：主进程已经做了 `app.json` 回写与版本校验，
   让它顺带返回 base64 最省事，不新增 IPC 通道；上限 200MB 与技能包一致。
5. **下载鉴权按源判定**：只有命中 `resolveAuthApiOrigin()` 的 URL 才附加
   `Fusion-Auth` / `Product-Id`，避免把 token 发到第三方 OSS 地址。

## 测试策略

- `test/renderer/open-platform/openPlatformHttpApi.test.ts`（新增）：
  用 axios 替身断言 URL、query、FormData 字段、分页循环、错误码映射、
  `latestRelease` 补零、`republish` 走 actions。
- 既有 `openPlatformMockAndPackage.test.ts` / `openPlatformConnectorEnable.test.ts` /
  `openPlatformConnectorStore.test.ts` / `openPlatformVersion.test.ts`：
  按 `listSkills(scope)` 与新入参最小调整，语义不变。
- `test/main/jiaorong/devCenterPublishedUpdate.test.ts`：补 `zipBase64` 返回断言。
- 手工验证：真实测试服发布 → 插件中心启用连接器 → 对话调用工具 → 下架 → 本地移除。
