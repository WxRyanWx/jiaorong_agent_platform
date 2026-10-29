# 任务清单（开放平台真实接口接入）

## 1. 契约与 http client

- [x] `api/openPlatform/types.ts`：`listSkills(scope)`、PublishInput 增 `package`、
      新增 `republishSkill` / `republishConnector`、`latestRelease` 可空。
- [x] `api/openPlatform/httpApi.ts`：原始 DTO + 映射 + 分页循环 + 错误码转换 +
      `Idempotency-Key` 生成 + `provider` 表单字段。
- [x] `api/openPlatform/index.ts`：默认 client 切到 http，mock 改为具名导出。
- [x] `api/openPlatform/mockApi.ts`：跟随契约（`listSkills(scope)`、`republish*`）。

## 2. 鉴权下载

- [x] `api/auth/config.ts`：新增 `isJiaorongPrivateApiUrl`。
- [x] `api/auth/privateApiHeaders.ts`：鉴权头构造，并从 `api/auth` 导出。
- [x] `utils/downloadSkill/installSkillFromZipUrl.ts`：命中私有源时带鉴权头下载。
- [x] `appHost/main/downloadAppZip.ts`：增 `options.headers`，私有源下载带鉴权头。
- [x] `appHost/appCenter/main/appCenter.ts`：`installAppCenterAppFromRemotePackage`
      （私有源校验 → 下载 → sha256 校验 → `installAppFromPackage` → 清临时包）。
- [x] `appHost/types.ts`：`JiaorongAppCenterItem` 增 `downloadUrl` / `packageSha256`。
- [x] `appHost/channels.ts` + `appHost/main/register.ts` + `src/preload/index.ts` +
      `src/preload/index.d.ts`：新增 `jiaorong-app-center:install-remote-package` 通道。
- [x] `appHost/appCenter/renderer/useJiaorongAppCenter.ts`：安装三级分支
      （本地包 > 远端包 > OSS 目录）。

## 3. 发布侧送真实制品

- [x] `open-platform/renderer/AssetPane.vue`：暂存已选 `File`，草稿缺包时先弹选择器；
      提交新制品前做版本递增预检；重新发布走 `republish*`。
- [x] `appHost/devCenter/main/devCenter.ts`：`publishDevApp` 返回校验并回写后的
      `zipBase64`（200MB 上限），允许服务端卡片无本地登记记录。
- [x] `src/preload/index.ts` + `index.d.ts`：`publishDevApp` 补 `allowUnregistered`
      入参与 `zipBase64` 返回。
- [x] `open-platform/renderer/clientAppCapabilities.ts` + `useOpenPlatformApps.ts`：
      两条发布路径都带上 zip Blob。

## 4. 插件中心对账

- [x] `plugins/market/openPlatformMarket.ts`：`listSkills('market')`、
      应用卡片补 `downloadUrl` / `packageSha256`。
- [x] `renderer/src/stores/mcp.ts`：下架对账只在完整非空快照下执行
      （分页中途失败由 `fetchAllPages` 抛错，走 catch 分支不清空本地）。

## 5. 文档与收尾

- [x] `docs/open-platform-backend-issues.md`：后端待修问题清单 + 2026-10-27 复验结论。
- [x] `src/jiaorong_src/HOST_TOUCHPOINTS.md`：登记 H173（preload 两个触点）。
- [x] i18n：本轮无新增 key（`AssetPane.vue` 新文案沿用文件内既有中文口径）。
- [x] 单测：新增 `test/renderer/open-platform/openPlatformHttpApi.test.ts`（24 例）、
      `test/renderer/jiaorong/auth/authConfig.test.ts` 补私有源与鉴权头用例；
      既有 `openPlatformMockAndPackage` / `devCenterPublishedUpdate` 跟契约调整。
- [x] `pnpm run typecheck`、`pnpm run lint`、`pnpm run i18n`、`oxfmt`、相关 vitest。
- [ ] 手工验证：真实测试服发布 → 插件中心启用 → 对话调用工具 → 下架移除。

## 6. 后续修正

- [x] 接入真实数据后复现出的 4 个问题（技能市场卡片翻倍、MCP 初始化被开放平台请求阻塞、
      应用没有更新入口、发布卡片版本号布局错位）已单独立目标修复，
      见 `docs/issues/open-platform-market-sync/`；后端侧新增 3 条待修问题
      记在 `docs/open-platform-backend-issues.md`（P1-8 / P1-9 / P1-10）。
