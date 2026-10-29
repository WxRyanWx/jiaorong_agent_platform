# 开放平台后端接口待修问题清单

联调环境：`http://106.63.7.106:10001/api/deepchat-ext`（测试服）
联调时间：2026-10-27（首轮）／ 2026-10-27 17:35（后端修复后复验）／
2026-10-28 12:20（`source` 字段联调）
客户端分支：`dev1014`

下面每条都带实测复现方式。P0 会直接影响客户端功能，P1 是行为不一致或语义模糊，
P2 是文档缺口。

## 复验结论速览

| 编号 | 问题 | 首轮 | 复验 |
| --- | --- | --- | --- |
| P0-1 | 技能 / 连接器发布不校验版本号 | ❌ | ❌ 未修 |
| P0-2 | `provider` 没有落地 | ❌ | ❌ 未修 |
| P0-3 | 应用「首次发布不能带 `id`、更新发布必须带 `id`」 | 未发现 | 🆕 新确认 |
| P0-4 | 应用可见组织（`auth`）没有提交路径，`orgNames` 客户端也判定不了 | 未发现 | 🆕 新确认（客户端侧判定已统一） |
| P1-1 | `Idempotency-Key` 不强校验也不幂等 | ❌ | ❌ 未修 |
| P1-2 | `published` 直接 `remove` 报 403 | ❌ | ✅ 已修（改 400） |
| P1-3 | publish 不带 `version` 时静默沿用旧版本 | ❌ | ❌ 未修 |
| P1-4 | publish 用包内内容覆盖 `description` | ❌ | 未复验 |
| P1-5 | 已移除的应用仍可被 publish 复活，且版本号按已删除记录做高水位 | 未发现 | 🆕 新确认 |
| P1-6 | 已发布资产存在 `version` / `createdAt` 为 `null` | 未发现 | 🆕 新确认 |
| P1-7 | 网关对「路径不存在」返回 200 + `code:500` | ❌ | ❌ 未修 |
| P1-8 | `assets` 列表项缺 `categoryId`，技能分类筛选退化 | 未发现 | 🆕 新确认 |
| P1-9 | `legacy` 技能只有顶层 `downloadUrl`，`latestRelease` 为 `null` | 未发现 | 🆕 新确认 |
| P1-10 | `skill/list` 与 `assets?type=skill` 返回同一批数据 | 未发现 | 🆕 新确认 |
| P1-11 | `GET /skill/{id}` 对 `source=open-platform` 的技能返回 500 | 未发现 | 🆕 新确认 |
| P1-12 | `provider` 与 `orgNames` 并存，两者都为 `null` | 未发现 | 🆕 新确认 |
| P2-* | 文档缺口 | ❌ | ❌ 未修（另补 3 条，见下） |

复验用的探针数据已全部清理，三类资产 `scope=mine` 均为空，`scope=market`
只剩 `collaboration-platform`（应用）、21 条技能、2 条连接器，与复验前一致。

## P0：技能 / 连接器发布不校验版本号

> 复验（2026-10-27 17:35）：**仍未修**。同一个连接器 id 连续提交
> 不带 `version` → `version=null`、`abc`、`1.0`、`1.0.0`、`1.0.0`（重复）、`0.9.0`（降版本），
> 六次全部 `code=200`，且每次都换了新的 `releaseId`。

应用发布已有完整校验（`新版本必须大于当前版本`、`应用版本号必须为三段式 semver`），
但技能 / 连接器的 `POST /assets/publish` 完全不校验：

```bash
# 依次提交 1.0.0 → 1.0.1 → 1.0.0 → abc，四次全部 code=200
curl -X POST -H "Fusion-Auth: $TOKEN" -H "Idempotency-Key: k1" \
  -F "type=connector" -F "id=$CID" -F "version=abc" \
  -F "file=@pkg.zip;type=application/zip" \
  "$BASE/assets/publish"
```

期望：与应用一致，`version` 必填、三段式 semver、且必须大于当前版本。
客户端目前已在前端补了递增预检，但绕过前端就能写脏数据，插件中心的
「更新」按钮判定也会被脏版本带偏。

## P0：`provider`（提供组织）字段完全没有落地

> 2026-10-28 复测：列表项**已经有** `provider` 与 `orgNames` 两个键，
> 但 22 条技能、2 条连接器、2 条应用的取值全是 `null`，等于仍未落地。
> 详见下面的 P1-12。
>
> 复验（2026-10-27 17:35）：**仍未修**。三种送法后端都 `code=200` 接收，
> 但列表项里连 `provider` 这个键都没有（不是 `null`，是字段缺失）：
> `POST /assets/draft` 的 `manifest` 里带 `provider`、`POST /assets/publish`
> 与 `POST /assets/app/publish` 带 `provider` 表单字段、`manifest` JSON 里带 `provider` 键。
> 客户端目前三处都送，后端补齐后无需改客户端。

发布表单里「提供组织」是必填项，但：

- `POST /assets/draft` 的 `manifest` 里带 `provider` / `orgName` → 不回显
- `POST /assets/publish` 带表单字段 `provider=四公司` → 被忽略
- `GET /assets` 列表项里没有 `provider` 字段

期望：三处任选一种方案落地并在列表返回，客户端插件中心要用它显示提供方。

## P0：应用发布「首次不能带 `id`、更新必须带 `id`」，且两种错法都很容易踩

> 复验（2026-10-27 17:35）确认，四种组合的实测结果：
>
> | 场景 | 是否带 `id` 表单字段 | 结果 |
> | --- | --- | --- |
> | 全新 id 首次发布 | 带 | `404 应用记录不存在` |
> | 全新 id 首次发布 | 不带 | `200 success` |
> | 已存在 id 更新发布 | 不带 | `409 应用 ID 已存在` |
> | 已存在 id 更新发布 | 带 | `200 success` |

```bash
# 首次发布：带 id 直接 404
curl -X POST -H "Fusion-Auth: $TOKEN" -H "Idempotency-Key: k1" \
  -F "id=$NEW_ID" -F "manifest={\"id\":\"$NEW_ID\",...}" -F "file=@app.zip" \
  "$BASE/assets/app/publish"
# {"code":404,"message":"应用记录不存在"}
```

期望二选一：

1. 后端自己按 `manifest.id` 判断新建 / 更新，`id` 表单字段变成可选（推荐，
   文档里也没写过这个字段）；
2. 或保持现状，但在文档里写清「首次不带、更新必带」，并把两条错误信息改成
   能自解释的文案（`404 应用记录不存在` 对首次发布完全没提示作用）。

客户端目前已按方案 2 实现：`serverStatus === 'local'` 时不送 `id`，否则必送。
后端若改成方案 1，客户端可以简化但不会坏。

## P0：应用可见组织（`auth`）没有提交路径，`orgNames` 客户端也判定不了

客户端发布应用时会组装可见范围：

```json
{ "orgs": [], "orgNames": "组织名1,组织名2", "userIds": [], "phones": [] }
```

但真实 HTTP 客户端 `publishApp` 只提交 `manifest` 与 `file`，**`auth` 被直接丢弃**；
`发布应用.md` 也没有 `auth` 参数。结果是发布弹窗里填的「可见组织」永远进不了库，
接口 `scope=market` 返回的 `auth` 恒为 `null`（实测 `meeting`、
`collaboration-platform` 两条都是 `null`）。

即使后端能存 `orgNames`，客户端仍然判定不了：

- 客户端可见性只看 `auth.orgs`（组织号数组）/ `auth.userIds` / `auth.phones`；
  三者全空即按「未限制可见性」放行给所有人（`appHost/auth.ts` 的 `normalizeAppAuth`）。
- `auth.orgNames` 是组织**名称**字符串，当前登录态里只有 `orgNo` / `pathNo` / 手机号，
  没有组织名，客户端无法拿它做匹配。

期望（二选一，并同步文档）：

1. `POST /assets/app/publish` 增加可选表单字段 `auth`（JSON 字符串），落库后
   `GET /assets?type=app` 返回时把 `orgNames` 解析成 `orgs`（组织号数组）一起回显；
2. 或者明确「`auth` 从 `manifest` / 包内 `app.json` 读取」，但同样需要在列表里回填 `orgs`。

影响面：内置应用（`source=builtin`）与交融应用（`source=store`）共用这一条 auth 链路，
不修的话两边「可见组织」都不生效，等同于公开。

客户端侧（2026-10-28 已统一）：只要列表接口回传 `auth.orgs` / `auth.userIds` /
`auth.phones`，内置应用与交融应用就走同一条判定链路 —— 市场卡片不再展示无权应用，
已安装但事后被收权的应用会从侧栏与应用中心消失且无法打开（仍可卸载清理本地目录），
三个数组全空按「全员可见」处理。也就是说后端把 `auth` 落库并回显后，无需再改客户端；
目前接口恒为 `null`，所以线上表现仍是全员可见。

## P1：`Idempotency-Key` 既不强校验也不幂等

> 复验（2026-10-27 17:35）：**仍未修**。同一个 key 提交两个不同 id 的草稿，
> 两条都建出来了；完全不传该头也 `code=200`。

文档标 `required: true`，实测：

1. 完全不传 → 依然 `code=200` 成功。
2. 用**同一个 key** 提交**不同 body**（不同 id）→ 也成功，并新建了一条记录，
   没有返回首次请求的缓存结果。

```bash
curl -X POST -H "Idempotency-Key: same-key" -F "type=connector" -F 'manifest={"id":"a",...}' "$BASE/assets/draft"
curl -X POST -H "Idempotency-Key: same-key" -F "type=connector" -F 'manifest={"id":"b",...}' "$BASE/assets/draft"
# 两条都建出来了
```

期望：要么按标准幂等语义实现（同 key 返回首次结果，body 不一致报 409），
要么把这个头从文档里去掉，别让前端误以为重试是安全的。
客户端目前每次请求都生成新 key，实际上没有拿到任何幂等保护。

## P1：`published` 状态直接 `remove` 报「无权管理该资产」

> 复验（2026-10-27 17:35）：**已修**。现在返回
> `{"code":400,"message":"仅草稿或已下架记录可移除，发布中的记录需先下架"}`，
> 语义正确。客户端已按 400 → `INVALID_REQUEST` 映射并原文透出。

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"type":"connector","id":"<自己的已发布资产>","action":"remove"}' \
  "$BASE/assets/actions"
# {"code":403,"message":"无权管理该资产"}
```

实际原因是状态机不允许（要先 `unpublish`），不是权限问题。
403 + 「无权管理」会把用户引到「账号没权限」的错误方向。
期望：改成 400 + 「已发布资产需先下架才能移除」。

## P1：技能 / 连接器 publish 不带 `version` 时静默沿用旧版本

```bash
# 当前 version=abc，再发一次不带 version
curl -X POST -F "type=skill" -F "id=$SID" -F "file=@pkg.zip" "$BASE/assets/publish"
# code=200，version 仍是 abc，但 releaseId 已经换新
```

同一份版本号对应了两份不同制品，违背「一个版本号只对应一份内容」。
期望：`version` 必填，缺省直接报 400。

## P1：publish 会用包内内容覆盖 `description`，可能覆盖成空串

```bash
# draft 时 description="provider 探针"
# publish 的 zip 里 mcp.json 没写 descriptions
# 结果：description 变成 ""
```

期望：包内没写描述时保留 draft 的值，而不是清空。

2026-10-28 补充实测：publish 后资产 `name` 也会被 zip 内 `SKILL.md` 的
`name` 覆盖（draft 展示名「探针来源技能」→ publish 后 name 变
`probe-src-skill`）。客户端的已装关联按市场名落键，展示名一变关联就断，
现已按「市场名 + 资产 id」双键兜底；仍建议后端保持 draft 展示名稳定，
或明确 name 以包内为准。

## P1：技能 / 连接器更新后版本号倒退，插件中心「更新」按钮消失

2026-10-28 实测，`open-platform-report-skill` 更新后 `version` 从 1.10.3
掉到 1.0.1、`sha256` 不变、`createdAt` 变成 2026-10-28T05:40:03，记录被整体重建；
`jina-public-mcp` 同样被重建且版本仍是 1.0.1。客户端本地安装记录是旧的高版本，
市场版本 1.0.1 < 本地版本时按语义不该提示「更新」（那是降级），
于是按钮消失。这是后端版本状态被重置导致的，前端无法区分「内容真变了」
与「版本号倒退的脏数据」。期望：publish 保留资产原 `createdAt` 并校验版本
只升不降（P0-1），更新按钮即可恢复。

## P0：应用发布忽略 `source`，`builtin` 一律被存成 `store`

2026-10-28 实测（直连测试服，模拟客户端完整请求）：

```bash
# zip 内 app.json 与 manifest 表单字段都写了 "source":"builtin"
curl -X POST -H "Fusion-Auth: $TOKEN" \
  -F 'manifest={"id":"probe-src-app",...,"slot":"app-center","source":"builtin"}' \
  -F 'provider=probe-org' -F 'file=@probe-src-app.zip' \
  "$BASE/assets/app/publish"
# {"code":200,...,"data":{"source":"open-platform","id":"probe-src-app","version":"1.0.0"}}

# 列表回显
curl -H "Fusion-Auth: $TOKEN" "$BASE/assets?type=app&scope=mine"
# {"id":"probe-src-app","source":"store"}
```

客户端两条路径都传了 `source`：`POST /assets/app/publish` 的 `manifest` 表单字段、
以及 zip 内被回写的 `app.json`。后端仍返回 / 回显 `store`，说明发布接口没读
这个字段（或读的是别的字段名）。

期望：明确 `source` 的入参位置（manifest 表单字段 / 包内 app.json / 独立表单字段），
取值 `builtin | store`，缺省 `store`，并在 `GET /assets?type=app` 回显。
客户端按 `app.json` 原值透传，无需再改。

## P1：已移除的应用仍可被 publish 复活，且版本号按已删除记录做高水位

复验（2026-10-27 17:35）实测，应用 `probe-app` 走完 `unpublish` → `remove` 之后：

1. `GET /assets?type=app&scope=mine` 不再返回它；
2. `POST /assets/actions`（`unpublish` / `remove`）对它返回 `404 资产记录不存在`；
3. 但 `POST /assets/app/publish` 带 `id=probe-app` **仍然成功**，
   并且它重新出现在 `scope=mine` 里，`status=published`；
4. 版本比较还在拿这条已删除记录当基准：发 `1.0.0` / `1.0.1` / `1.0.2` / `1.0.4`
   全部报 `400 新版本必须大于当前版本`，发 `99.0.0` 才通过。

两个问题：

- **状态不一致**：actions 与 list 认为记录不存在，publish 却能找到它。
  要么 remove 做物理删除，要么三处口径统一。
- **id 无法复用**：用户移除自己的应用后，同一个 id 再也发不上去
  （除非猜到一个比历史高水位更大的版本号），而错误信息完全没提这件事。

期望：`remove` 之后 id 可复用（版本高水位一并清掉），
或至少在错误信息里带上「该 id 历史最高版本为 x.y.z」。

## P1：已发布资产存在 `version` / `createdAt` 为 `null` 的脏数据

复验（2026-10-27 17:35）在 `scope=market` 的技能列表里看到：

```json
{ "id": "dev-god", "status": "published", "version": null, "createdAt": null }
```

`version` 为 `null` 会让插件中心的「更新」判定永远不触发（客户端已兜底：
市场版本为空时不提示更新，而不是报错）；`createdAt` 为 `null` 与文档声明的
`type: string` 不符，客户端按空串处理。

期望：存量数据补一个版本号（哪怕 `0.0.0`），并保证 `published` 记录
`version` / `createdAt` 非空；同时把这两个字段在文档里标成 nullable。

## P1：`assets` 列表项没有 `categoryId`，技能市场分类筛选退化

> 2026-10-28 复测：**部分修复**。`legacy` 技能已带 `categoryId`（如 `rd`），
> `open-platform` 技能仍为 `null`，即发布时提交的分类还没落库（见 P2-13）。

复验（2026-10-28）实测 `GET /assets?type=skill&scope=market`，22 条记录里
没有任何一条带 `categoryId`（键缺失，不是 `null`）：

```bash
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/assets?type=skill&scope=market&page=1&pageSize=100" \
  | jq '.data.items[0] | keys'
# 没有 categoryId
```

而旧接口 `GET /skill/list` 的每条记录都带 `categoryId`，技能市场页左侧的分类
pill 依赖它做筛选。客户端已容错：`categoryId` 缺失时把该技能归到「全部」，
点具体分类会得到空列表。

期望：`assets` 列表项补 `categoryId`（与 `skillCategory/list` 的 id 对齐），
并在文档的 `AssetSummary` 里写明该字段。

## P1：`legacy` 技能只有顶层 `downloadUrl`，`latestRelease` 为 `null`

复验（2026-10-28）实测 `scope=market` 的 22 条技能里 **20 条** 是
`source: "legacy"`（旧技能市场迁入），它们的 `latestRelease` 全为 `null`、
`version` 也为 `null`，可用的下载地址只在顶层 `downloadUrl`：

```json
{
  "id": "s51", "name": "24清单", "source": "legacy",
  "version": null, "latestRelease": null,
  "downloadUrl": "http://.../assets/skill/s51/package"
}
```

`source: "open-platform"` 的条目两个字段同值。

客户端已按「`latestRelease.downloadUrl` 优先、顶层 `downloadUrl` 兜底」读取，
两种来源都能装。但这意味着：

- 存量 `legacy` 技能没有版本号，插件中心永远不会对它们提示「更新」；
- 顶层 `downloadUrl` 与 `latestRelease.downloadUrl` 的优先级只在前端口头约定。

期望：给 `legacy` 存量补一个版本号（哪怕 `0.0.0`），并在文档里写明
「以顶层 `downloadUrl` 为准，`latestRelease` 仅 `open-platform` 来源有值」。

## P1：`GET /skill/{id}` 对 `source=open-platform` 的技能返回 500

2026-10-28 实测，旧技能详情接口只认 `legacy` 存量：

```bash
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/skill/s38"
# {"code":200,...,"exampleTemplateList":[...],"provider":null,"orgNames":null}
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/skill/dev-god"
# {"code":500,"message":"技能不存在","data":null}
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/skill/open-platform-report-skill"
# {"code":500,"message":"技能不存在","data":null}
```

`dev-god` 与 `open-platform-report-skill` 都在
`GET /skill/list` 与 `GET /assets?type=skill&scope=market` 里正常返回，
只有详情接口查不到。

客户端已按列表项的 `source` 分流：`legacy` 才请求旧详情接口，
`open-platform` 直接用市场列表带来的名称 / 描述 / 下载地址，不再打这个接口。

期望二选一：

1. 明确旧详情接口只服务 `legacy`，并在文档里写清；开放平台技能的
   `exampleTemplateList`（试一试提示词）改由 `assets` 侧或包内 `SKILL.md` 提供；
2. 或让 `GET /skill/{id}` 也能查到开放平台技能，返回值补 `source` 字段，
   客户端已预留解析（`SkillDetailResponse.source`），后端补齐即自动生效。

## P1：`provider` 与 `orgNames` 并存，语义未定

2026-10-28 实测 `GET /assets` 三种类型的列表项都同时返回
`provider: null` 与 `orgNames: null`：

```json
{ "id": "s38", "source": "legacy", "provider": null, "orgNames": null, "categoryId": "rd" }
{ "id": "app1", "source": "store", "provider": null, "orgNames": null }
```

应用另有一套 `auth.orgNames`（可见组织），与顶层 `orgNames` 是不是同一个语义也不清楚。

期望：明确「发布组织」以哪个字段为准（客户端目前只读 `provider`），
另一个字段若是可见范围请改名，避免两边各自演化。
客户端的「重新发布」按钮以 `provider` 非空为门槛，
后端落地前该按钮保持置灰（已与需求方确认）。

## P1：`skill/list` 与 `assets?type=skill` 返回同一批数据

复验（2026-10-28）实测两个接口各返回 22 条，`id` 完全一致：

```bash
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/skill/list" | jq '[.data[].id] | length, .[0:3]'
curl -s -H "Fusion-Auth: $TOKEN" "$BASE/assets?type=skill&scope=market" \
  | jq '[.data.items[].id] | length, .[0:3]'
# 两者都是 22 条，id 一致
```

客户端此前同时走两个接口做合并，导致技能市场每条技能出现两张卡
（其中一张没有下载地址）。现已收敛为只走 `assets`。

期望：明确 `skill/list` 是否下线；若保留，请说明它与 `assets` 的差异
（例如 `skill/list` 返回 `categoryId` / `alias` / `exampleTemplateList`，
而 `assets` 不返回），避免两边各自演化。
顺带一提，技能详情接口 `GET /skill/{id}` 返回的 `exampleTemplateList`
在 `assets` 侧没有对应字段，客户端详情页仍依赖旧接口。

> 2026-10-28 更新：`assets` 列表项已经开始返回 `categoryId`
> （20 条 `legacy` 技能都带 `rd` 等分类），但 2 条 `open-platform`
> 技能的 `categoryId` 仍是 `null` —— 说明发布时提交的 `categoryId`
> 表单字段还没落库（见 P2-13）。
> 同时 `assets` 列表项新增返回 `source`（`open-platform` / `legacy`），
> 客户端已用它区分新旧技能，文档需要补进 `AssetSummary`。

## P1：网关对「路径不存在」和「鉴权失败」的响应不一致

- 访问不存在的路径 → HTTP 200 + `{"code":500,"message":"系统繁忙"}`
- token 缺失 / 错误 → HTTP 401
- 业务校验失败 → HTTP 200 + `code:400/403/404/409`

「系统繁忙」实际是路由未命中，排查时极易误导。期望路径不存在返回 HTTP 404。

## P2：`Authorization: Bearer` 不被接受

只认 `Fusion-Auth` 头，`Authorization: Bearer <token>` 一律 401。
文档里也没写清楚这一点，建议在文档显式声明「只支持 `Fusion-Auth`」。

## P2：`Product-Id` 头的必要性未说明

文档 6 个接口都没提 `Product-Id`，实测测试服不带也能通。
客户端现有拦截器会统一带上（与登录、技能市场等接口一致）。
请确认正式服是否必需，并在文档补上。

## P2：文档缺口

1. **缺包下载接口**：`GET /assets/{type}/{id}/package` 在列表的 `downloadUrl`
   里返回，但 6 份文档都没有它。且该接口**必须带鉴权头**，裸请求返回 401
   （无 body、无 `Content-Type`），文档需要写明，否则前端会按公开直链处理。
2. **`GET /assets` 的 `items` schema 写成了 `type: string`**，
   实际是对象数组，需要补 `AssetSummary` 完整结构，包括：
   - 通用：`type`、`id`、`name`、`description`、`version`、`status`、`iconUrl`、
     `createdAt`、`updatedAt`、`latestRelease`（**草稿态为 `null`**）、
     `source`、`downloadUrl`
   - 应用额外：`slot`、`auth`
   - 连接器 `scope=market` 额外：`config`（`type`/`command`/`args`/`env`/`baseUrl`/
     `customHeaders`/`customNpmRegistry`/`inheritEnv`/`descriptions`/`icons`/
     `enabled`/`authorization`/`source`/`sourceId`）、`sourceId`
3. **`POST /assets/publish` 缺 `version` 表单字段**（本轮新加的，文档还没更新）。
4. **`POST /assets/app/publish` 缺 `id` 表单字段**：
   首次发布不带 `id` 可以，**更新发布必须带 `id`**，
   否则一律报 `409 应用 ID 已存在`。这条完全没在文档里，属于必踩坑。
   已升级为上面的 **P0：应用发布「首次不能带 `id`、更新必须带 `id`」**。
5. **`POST /assets/app/publish` 的 `manifest.version` 缺省行为未说明**：
   不带 version 时报的是 `新版本必须大于当前版本`，而不是「版本号必填」，
   报错信息对不上真实原因。
6. **`POST /assets/publish` 的 responses 只写了 401**，
   实际有 400（`请求 id 与包内 id 不一致`）、404（`资产记录不存在`）等。
7. **`POST /assets/actions` 的响应 schema 写成了空 object**，
   实际返回完整的 `AssetSummary`；且缺状态机说明：
   `unpublish` 只对 `published` 生效、`republish` 只对 `unpublished` 生效、
   `remove` 只对 `draft` / `unpublished` 生效。
8. **`page=0` 被当成 `page=1`**，未做入参校验（不影响功能，提一下）。
9. **`pageSize` 上限 100 未写进文档**：传 `pageSize=200` 时响应里
   `pageSize` 被夹到 100，`hasMore` 仍正确。客户端按 100 循环翻页，
   请确认这个上限是固定的还是可配的。
10. **缺 `scope` 时返回 `code=200` + 空列表**，而文档把 `scope` 标成
    `required: true`。空列表比报错更危险：客户端会以为市场真的空了。
    期望缺参直接 400（`type=unknown` 已经是 `400 type 取值必须为 app/skill/connector`，
    口径不一致）。
11. **列表项同时返回 `latestRelease.downloadUrl` 与平铺的 `downloadUrl`**，
    `source: "open-platform"` 的条目两者一致，`source: "legacy"` 只有平铺的那个
    （详见上面的 P1）。文档需要写明以哪个为准、会不会出现不一致，
    否则两边各自演化就会踩坑。客户端目前按「`latestRelease.downloadUrl` 优先、
    平铺 `downloadUrl` 兜底」读取。
12. **`provider` 送法未定**：表单字段与 `manifest` 里的键后端都收，
    落地后请明确只认一种，客户端好收敛。
13. **`POST /assets/publish` 缺 `categoryId` 表单字段说明**（2026-10-28 新增）：
    技能发布弹窗新增「技能类型」必填下拉，选项来自 `skillCategory/list`，
    客户端以表单字段 `categoryId=<分类id>` 随 `type=skill` 的 publish 提交。
    请后端确认接收、落库并在 `GET /assets` 列表项回显（与上面 P1 的
    「列表项没有 `categoryId`」一并解决），文档同步补 `categoryId` 与 `provider` 字段。
14. **草稿接口不接收制品，导致「创建时上传、发布只改状态」做不到**（2026-10-28 实测）：
    - `POST /assets/draft` 带 `file` 会被忽略，响应 `latestRelease: null`，服务端没有存包；
    - `POST /assets/publish` 不带 `file` 返回 `200 {"code":500,"message":"系统繁忙，请稍后重试"}`，
      带 `file` 才成功。
    - 期望（二选一）：①`/assets/draft` 支持 `file`（必填或选填）并把制品挂在草稿资产上，
      `/assets/publish` 的 `file` 改为可选、缺省沿用草稿制品，仅改状态与发布信息；
      ②保持现状但在文档里写明「发布必须带 zip」。
      客户端当前按现状处理：创建时选的 zip 落到本地 IndexedDB，发布时自动带回，
      用户不需要重新选包；后端支持草稿带包后可以删掉这份本地缓存。

## 已确认可用、无需改动的部分

- 7 个接口全部连通，分页 `hasMore` 正确。
- 应用发布的版本递增与 semver 校验符合预期。
- `republish` 沿用原 `releaseId` / `sha256` / `version`，
  与业界「重新上架不抬版本」的口径一致。
- 下架后 `scope=market` 立即不再返回该条，`scope=mine` 仍可见且 `status=unpublished`，
  客户端据此做本地移除对账。
- 包下载的 `sha256` 与原包一致，可用于完整性校验。
- 跨用户资产访问被正确拦截（`403 无权管理该资产`）。
- 复验新增确认：`published` 直接 `remove` 已改成
  `400 仅草稿或已下架记录可移除，发布中的记录需先下架`（原 403，已修）；
  `actions` 对不存在的 id 返回 `404 资产记录不存在`；
  技能草稿 `remove` 之后同 id 可以重建，没有应用那种 id 残留问题；
  包下载仍是「带鉴权头 200、裸请求 401」，`sha256` 与原包一致。
