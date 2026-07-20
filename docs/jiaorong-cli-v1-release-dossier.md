Release ID: JRC-REL-0.1.0-RC1
Status: Go — release-verified with LIVE-009 waiver
Release authority: workspace owner
Decision date: 2026-07-20
Accepted baseline: JRC-FEATURE-001 revision 2026-07-20.1
Candidate artifact: `test-results/release-0.1.0-rc1/jiaorong-cli-0.1.0.tgz`

# Jiaorong CLI 0.1.0 RC1 Release dossier

## 1. 候选身份

| 项目 | 值 |
|---|---|
| 固定比较基线 / HEAD | `43c092484fd40285ad64833c5771774e3f636104` |
| 分支 | `codex/jiaorong-app-backed-cli` |
| 版本 | `0.1.0` |
| artifact | `jiaorong-cli-0.1.0.tgz` |
| artifact 大小 | 63,000 bytes |
| artifact SHA-256 | `949a36bc1bdf1b9bdb77e61e4500ab85493e201c63f88b3724bb8c50c6a69e32` |
| npm SHA-1 | `e533fc19ff562065ec201d15d5f86180f46b9696` |
| npm integrity | `sha512-+dF8hM09K0aEuN9cCZEJ7bcZjodvZxTWUvfm2lDTj7EOHXvG6LfQI0soFC6ceOaGVijxAAxHlRhWjppRgq/XQA==` |
| package 条目 | 77 |
| unpacked size | 304,314 bytes |
| package input tree SHA-256 | `a0d5b561fded1c320aff4d9bc04a5d84128cfa527b8422151139c520a02c853b` |
| package-lock SHA-256 | `a93424934fda70e5a4ab3254c331ffc49190a78378daf72bc63dd01d35ca4cf6` |
| 冻结时 tracked binary diff SHA-256 | `abbe5fef452ae91f35cfae62bce7bd3abb2413f44d8836f9ae763497c25a4e3c` |
| 构建时间 | `2026-07-20T01:29:53+0800` |
| Node / npm | `v24.12.0` / `11.8.0` |
| 平台 | macOS 15.7.3 build 24G419, arm64 |

候选生成后没有修改 77 个 package input。后续变更只涉及 Release/Ticket/验收证据文档，不属于 tgz 输入。解包内容不含 tests、`.scratch`、docs、`node_modules` 或 `test-results`。全局安装目录与 tgz 解包目录逐文件比较一致（排除 npm 安装的 `node_modules`）。

此外把同一份 77 项冻结输入复制到新的 `/tmp/jiaorong-cli-rc1-repro.IDZ60Q` 隔离目录并独立执行 `npm pack`；第二个 tgz 的 SHA-256 仍为 `949a36bc1bdf1b9bdb77e61e4500ab85493e201c63f88b3724bb8c50c6a69e32`，与 RC1 逐字节可验证为同一候选。隔离临时目录随后已清理。

## 2. 候选前验证

| 验证 | 结果 |
|---|---|
| `npm test` | exit 0；161/161 passed；0 failed/skipped |
| `npm run conformance:fixture` | exit 0；98/98 active executed；0 missing；0 failed |
| 全部 `.mjs` `node --check` | exit 0 |
| `npm audit --json` | 0 vulnerabilities |
| `git diff --check` | exit 0 |
| 双轴复核 | Spec 与 standards 最终均无未关闭 Blocker/High |

一次把 `npm test` 与完整 conformance 并行运行时，公共 runner 在 5.03 秒撞到 5 秒 harness timeout；同批 conformance 与其余 160 项通过。规范的 `npm test` 随后单独重跑，8.28 秒完成并通过 161/161。该失败保留在证据中，不被删改或计作通过。

## 3. 精确安装与真实 JiaorongAI smoke

安装命令：

```bash
npm install --global /Users/miemie/Documents/jiaorong-cli-v1/test-results/release-0.1.0-rc1/jiaorong-cli-0.1.0.tgz
```

安装路径：

- `/Users/miemie/.npm-global/bin/jiaorong-cli`
- `/Users/miemie/.npm-global/bin/jiaorong-cli-conformance`

目标 JiaorongAI：0.5.6；`app.asar` SHA-256 `46c10c761eb3c70f461061cbd80ad1c0cc2796aea29574e73cd85d445f1b22aa`；PID 6562；loopback `127.0.0.1:9238`。

| 场景 | 当前结果 |
|---|---|
| version | 0.1.0，exit 0 |
| doctor | `ok=true`；App 0.5.6；9 pass；authentication 为设计内的 run-time warn |
| models | 1 个 available default：`jiaorong/jiaorong-deepseek-v4-pro` |
| JSON 单轮 | Session `DEedHsI_fCiYnmzJ_Idtf`；`JRC_RC1_JSON_OK`；success |
| text | stdout 仅 `JRC_RC1_TEXT_OK`；exit 0 |
| stream-json / resume | 同 Session init `resumed=true`，唯一 result success |
| 真正的 Session 上下文 | Session `ATqSrcxCKooLglZX3uTht` 第二进程准确回复上一轮独有 canary `JRC_RC1_SESSION_MEMORY_64BC2A` |
| 文本 Attachment | PATH 命令在中文/空格 Project Root 中读取 `附件 你好.txt`，回复 `JRC_RC1_UNICODE_ATTACHMENT_82D4E1` |
| Additional Directory Read | Session `gYfDf2JKq5p2lBccUT6lo`；相关 `tool_use/tool_result`；result success；读出 `JRC_RC1_ADD_DIR_READ_7F3A9C` |
| Ctrl-C | Session `Xxy6GfB04Q5jMw5KI_3XQ`；2,471 ms；exit 130；stderr 空；唯一 result `cancelled/CANCELLED` |
| 图片 Attachment | 首版 waived：同一 RC1 接收并登记 PNG，但当前模型不能识图；workspace owner 已明确“第一版先不管图片 Attachment” |

## 4. 卸载与回滚

执行两次完整安装/卸载循环，最后一次卸载命令：

```bash
npm uninstall --global @jiaorong/cli
```

该回滚验证结果：

- `jiaorong-cli` 与 `jiaorong-cli-conformance` 均从 PATH 消失；
- `/Applications/JiaorongAI.app` 保留；
- PID 6562 和 `127.0.0.1:9238` listener 保持；
- 卸载后公开 bridge 仍可恢复 Session `ATqSrcxCKooLglZX3uTht`，`status=idle`，4 条消息；
- 所有临时 canary 与临时目录均已删除；
- CLI 不直接访问或迁移 JiaorongAI SQLite，因此无需数据 rollback。

为继续核实 LIVE-009，随后重新安装了同一 SHA-256 的 RC1；当前 `jiaorong-cli` 与 `jiaorong-cli-conformance` 已重新出现在 `/Users/miemie/.npm-global/bin`。这没有改变已完成的卸载/回滚证据，也没有生成新候选。

## 5. LIVE-009 继续核实

使用 SHA-256 `9686d768a632ce24e19384b7376fe690d57e2c21d666f4991c4a7417e43a8680` 的 1800×500 PNG 视觉 canary；图片从左到右为 magenta、cyan、lime、orange、black 五个纯色色块，文件位于隔离 Project Root，测试后已删除。

- Session `01uhEev_fE2IXhdCZULPN`：RC1 在 `init` 中登记 `image/png` Attachment，模型转而调用 `read` 读取 CLI 私有附件快照；工具未达到可验证终态，结果为 `INTERNAL_ERROR`，exit 1。
- Session `hy12p-9jZD1QKYbnJnTKn`：明确禁止工具并要求直接观察 Attachment；模型成功结束协议回合，但明确回复无法直接感知图片，未返回视觉 canary，exit 0。

这两次运行证明 Attachment 已真实到达同一 RC1 的 App Backend，但当前唯一 available 模型不能完成视觉识别。协议成功退出不等于 LIVE-009 通过。

## 6. Go / No-Go

决定：**Go；RC1 在批准的首版范围内标记 release-verified。**

Workspace owner 于 2026-07-20 明确决定：“不用本机 ollama，第一版先不管图片 Attachment。”该决定构成 LIVE-009 的首版 waiver，不要求启用 Ollama，也不把失败的图片 canary 改写为通过。

Waiver 范围与风险：

- 只豁免 LIVE-009 对首版 Feature acceptance 和 Release 的阻断；
- 图片 Attachment 仍有确定性 fake-bridge、预检和结构化传递覆盖，但没有当前本机真实视觉模型成功证据；
- 首版不得对用户承诺真实图片识别可用；图片能力留待后续版本在可用视觉模型上重新验收；
- 文本 Attachment、模型、Session、输出、文件工具、取消、安装和卸载证据不受影响。

RC1 的构建、精确安装、文本/JSON/stream、真实 Session、模型选择、文本 Attachment、文件工具、Ctrl-C 和卸载均已验证。结合上述明确 waiver，当前没有剩余 Release 阻断项。

## 7. 最终安装观察

Owner waiver 写入后，对当前已安装的同一 RC1 重新执行目标环境关键路径：

- `jiaorong-cli --version`：`0.1.0`；
- installed `doctor`：`ok=true`，JiaorongAI 0.5.6，loopback `127.0.0.1:9238`，9 项 pass，authentication 为设计内的 run-time warn；
- installed `models list`：唯一 available/default 模型仍为 `jiaorong/jiaorong-deepseek-v4-pro`；
- installed JSON 文本 canary：Session `3IyIIa00rfHLg7ZWqNtBz`，原样返回 `JRC_V1_RELEASE_GO_27C9`，`status=success`，exit 0。

当前目标安装身份、App readiness 和首版关键文本路径均通过；图片能力按 owner waiver 不属于本次成功阈值。

## 8. 运行与回滚边界

- 首版要求已安装并运行 JiaorongAI.app 0.5.6。
- 首版无 Shell：`exec` 与 `process` 始终禁用。
- 首版不保证图片 Attachment 的真实识别能力；使用文本 Attachment。
- 支持 macOS arm64 本地 npm artifact；未验证 macOS x64、Windows、Linux 或自包含签名二进制。
- 发布/安装后若 doctor 失败、bundle checksum 不匹配、endpoint 非 loopback、Session 非 idle、权限读回不一致或取消无法落定，应停止使用并卸载 CLI；不得重启、替换或修改 JiaorongAI 数据。
