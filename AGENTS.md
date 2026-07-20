# Repository instructions

Before planning, changing, or reviewing this repository, read `CONTEXT.md` and the relevant ADRs under `docs/adr/`.

## Agent skills

### Issue tracker

Specs and issues are tracked as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Local issues use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain layout. See `docs/agents/domain.md`.

## Automated verification

实现功能的同时，必须同步编写或更新自动化测试代码；完成后，必须运行这些测试并用测试结果验证实现。仓库的标准全量测试命令是 `npm test`；真实 JiaorongAI 与发布候选验证按对应 Ticket 另行执行并记录。
