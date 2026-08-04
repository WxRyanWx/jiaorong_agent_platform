# 单独上传 SKILL.md 误用 Downloads 父目录

## 用户需求

上传 md 时只安装这一个文件：
- 不考虑、不打包父目录（有附属文件时应上传文件夹 / zip）
- 技术 `name` 不应变成父目录名（如 `downloads`）
- 中文展示名仍写入 `metadata.displayName`

## 验收标准

- 任意路径下的 `.md` / `SKILL.md` 上传均为单文件安装
- 技术 `name` 由内容展示名稳定派生（ascii id），不是父目录名
- 文件夹 / zip 安装路径仍可保留附属文件（不受本条影响）

## 约束

- 仅改 `jiaorong_src` 安装兼容层；不改开源 `skillPresenter` 的 name 正则

## 非目标

- 不做中文拼音转写为可读英文 slug
