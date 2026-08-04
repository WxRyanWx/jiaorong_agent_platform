# skill-install-error-zh

## Goal

上传/安装失败时，私有目录将英文技术错误转成可读中文；并修复非技能 zip 在 Windows 上清临时目录 `ENOTEMPTY` 盖掉真实「缺少 SKILL.md」错误的问题。

## Why（用户现象）

1. 上传**文件夹**却提示 `SKILL.md not found in zip archive`：兼容层会把文件夹打成临时 zip 再走宿主安装，宿主统一报 zip 文案。
2. 上传**非技能 zip**（如普通附件包）出现 `ENOTEMPTY ... jiaorong-skill-xxx`：解压后找不到 SKILL.md 本应返回缺文件；清理临时目录在 Windows 上抛错，反而盖掉原错误。

## Acceptance

- Toast 对缺 SKILL.md、无效 zip、ENOTEMPTY、frontmatter 缺字段等给出中文说明
- 文件夹上下文不强调「zip」，zip 上下文提示「需含技能目录与 SKILL.md」
- 非技能 zip：用户看到「不是有效技能包」类提示，而非 IPC/ENOTEMPTY 原文
- 主进程 `installFromZip` 清理失败不覆盖业务错误返回值

## Non-Goals

- 不在此任务做上传前严格校验拦截（可后续加）
- 不改开源宿主对外英文 API 契约文案（仅清理与私有展示层）
