Acceptance record ID: JRC-ACC-001
Feature: JRC-FEATURE-001 revision 2026-07-20.1
Status: accepted with LIVE-009 waiver
Acceptance authority: workspace owner
Evidence date: 2026-07-20

# Jiaorong CLI v1 验收与交付报告

## 结论

Jiaorong CLI 0.1.0 RC1 已经真实构建、安装、连接 JiaorongAI 0.5.6、执行模型与文件工具、跨进程续接 Session、处理 Ctrl-C，并完成卸载回滚。自动化测试为 161/161，通过全部 98 个 active deterministic conformance case。

本机唯一可用模型只支持 text input。同一 RC1 后续两次图片 canary 均证明 Attachment 已到达 App Backend，但模型一次转而调用失败的 `read`，一次明确回复无法直接感知图片。Workspace owner 已明确决定“不用本机 ollama，第一版先不管图片 Attachment”，因此 LIVE-009 作为首版 Release 门禁被明确 waived，不记为通过，也不再阻断首版。最终状态是 **Feature accepted with waiver / Go / release-verified for the approved first-release scope**。

## 做成了什么

CLI 命令 `jiaorong-cli` 不复制 JiaorongAI 的模型、工具、账号或数据库。它连接已安装的 JiaorongAI 0.5.6，通过受限 loopback CDP 和 allowlisted Deepchat Bridge 完成：

- `--version`、`doctor`、`models list`；
- prompt 参数或 stdin；
- text、json、stream-json；
- 新 Session 与 `--resume`；
- 文本 Attachment 的真实使用，以及文本/图片类型 Attachment 的安全预检与结构化传递；图片真实识别不属于首版验收范围；
- Project Root 与 `--add-dir` 文件边界；
- default / full_access 非交互权限策略；
- Read、Write、Edit、Glob、Grep 的闭集审批；
- Ctrl-C、timeout 与稳定 Machine Error Code；
- 精确 tgz 安装与安全卸载。

首版明确没有 Shell 或后台进程工具；`exec`、`process` 创建时禁用，resume 时复核。这是批准的安全边界，不是遗漏。

## AC-01–AC-15 验收矩阵

| ID | 状态 | 当前证据 |
|---|---|---|
| AC-01 | achieved | installed `--version` 0.1.0；doctor App 0.5.6/loopback/bridge；不安全 endpoint 负测 |
| AC-02 | achieved | argv/stdin/Unicode/shell metacharacter 进程测试；中文/空格路径 live attachment |
| AC-03 | achieved | 三种输出确定性验证；installed text/json/stream-json live success，stderr 隔离 |
| AC-04 | achieved | Session `ATqSrcxCKooLglZX3uTht` 跨进程复述上一轮独有 canary；卸载后仍可 restore |
| AC-05 | achieved | catalog 读取；显式 `jiaorong/jiaorong-deepseek-v4-pro` 在结果中生效 |
| AC-06 | achieved | Attachment 缺失/类型/大小/traversal/symlink 在 Session 前拒绝；live 文本 Attachment 成功 |
| AC-07 | achieved | deterministic default deny/full-access 边界；live full_access Additional Directory Read |
| AC-08 | achieved | live Read 产生一个相关 tool_use 和一个 success tool_result；projector 负测防重复 |
| AC-09 | achieved | 多进程不同 Session、同 Session 竞争、retired identity 与 crossed event 测试通过 |
| AC-10 | achieved | installed Ctrl-C：2,471 ms、exit 130、cancelled/CANCELLED、stderr 空 |
| AC-11 | achieved | timeout/turn limit deterministic；取消 CDP wait 按剩余 30 秒 grace 裁剪；App 一 run 固定一 turn |
| AC-12 | achieved | 98 required/executed、0 missing/failed；live/deferred 与 deterministic 分区明确 |
| AC-13 | achieved | 每项 live 结论列出命令结果/Session/canary；LIVE-009 的失败证据与首版 waiver 均明确记录 |
| AC-14 | achieved | RC1 checksum、精确全局安装、installed smoke、内容一致性、两次卸载回滚均有证据 |
| AC-15 | waived | workspace owner 明确首版不考虑图片 Attachment；保留负证据，不升级为通过 |

Feature Spec 允许由 workspace owner 对无法证明的 live 场景作出明确 waiver。LIVE-009 的证据缺口、失败表现和风险均已记录；该 waiver 只移除首版门禁，不证明图片识别能力。

## Live inventory

| Case | 状态 | 说明 |
|---|---|---|
| LIVE-001 | pass | installed 单轮模型 success |
| LIVE-002 | pass | 第二进程复述上一轮独有 Session canary |
| LIVE-003 | pass | catalog 与显式模型选择 |
| LIVE-004 | pass | Additional Directory Read，相关工具事件和 canary |
| LIVE-005 | pass | text stdout 只有正文 |
| LIVE-006 | pass | 单个合法 JSON result |
| LIVE-007 | pass | init/message/result JSONL，唯一 terminal |
| LIVE-008 | pass | Unicode/空格路径文本 Attachment canary |
| LIVE-009 | waived for v1 | Session `01uhEev_fE2IXhdCZULPN` 转而调用 `read` 后失败；Session `hy12p-9jZD1QKYbnJnTKn` 明确回复无法直接感知图片；owner 决定首版不考虑图片 Attachment |
| LIVE-010 | pass | 真实 Ctrl-C 远端停止并 exit 130 |
| LIVE-011 | pass | doctor readiness |
| DST-001 | pass | macOS arm64 tgz 安装、PATH、卸载 |
| DST-005 | pass | PATH 命令与绝对 installed path 均完成 smoke |
| DST-006 | pass | 中文/空格 Project Root 与 Unicode 文件名 |

## 自动化与审查

- `npm test`: 161/161 passed。
- `npm run conformance:fixture`: 98/98 active，0 missing，0 failed。
- `node --check`: 全部 `.mjs` 通过。
- `npm audit --json`: 0 vulnerabilities。
- `git diff --check`: 通过。
- Spec 与 standards 两条独立复核最终没有未关闭 Blocker/High。
- Owner waiver 后的 installed target 复核：doctor `ok=true`；Session `3IyIIa00rfHLg7ZWqNtBz` 原样返回 `JRC_V1_RELEASE_GO_27C9`，`status=success`，exit 0。

并行运行 full test 与 conformance 曾造成公共 runner 5.03 秒超时；标准 `npm test` 单独重跑后 161/161 通过。报告保留该事实，避免只挑成功日志。

## 安装、使用与卸载

逐功能中文教程见 [Jiaorong CLI v1 完整使用教程](./jiaorong-cli-v1-user-guide.md)。

同一 RC1 在完成回滚验证后，为继续核实 LIVE-009 已重新安装；当前命令位于 `/Users/miemie/.npm-global/bin`。重新安装命令为：

```bash
npm install --global /Users/miemie/Documents/jiaorong-cli-v1/test-results/release-0.1.0-rc1/jiaorong-cli-0.1.0.tgz
command -v jiaorong-cli
jiaorong-cli --version
jiaorong-cli doctor --output-format json
jiaorong-cli models list --output-format json
```

基本运行：

```bash
jiaorong-cli -p '你的任务' --model jiaorong/jiaorong-deepseek-v4-pro
jiaorong-cli -p '继续任务' --resume <SESSION_ID> --output-format stream-json
```

只有信任的本地自动化才使用 `full_access`，且外部目录必须逐次声明：

```bash
jiaorong-cli -p '读取指定文件' \
  --permission-mode full_access \
  --add-dir /absolute/authorized/directory \
  --output-format stream-json
```

卸载：

```bash
npm uninstall --global @jiaorong/cli
```

卸载只删除 CLI 包和命令，不删除 JiaorongAI.app、Session 或用户数据。

## 局限与下一步

1. 图片 Attachment 延后到后续版本；届时必须在 available image-capable model 上重新执行 live canary，不能继承本次 waiver 作为通过证据。
2. 首版仍只支持 macOS arm64、Node >=22、JiaorongAI.app 0.5.6；不是签名、自包含的跨平台二进制。
3. 同一 Agent Session 不应由桌面 UI 与 CLI 并发运行；Session idle check 与 permission reset 不是上游原子事务。

完整候选身份与命令证据见 [jiaorong-cli-v1-release-dossier.md](./jiaorong-cli-v1-release-dossier.md)。
