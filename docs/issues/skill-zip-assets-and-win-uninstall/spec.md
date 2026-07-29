# skill-zip-assets-and-win-uninstall

## Problem

1. 市场「点击安装」远程 zip 时，包内 `docs/`、`scripts/` 等附属目录丢失，只留下 `SKILL.md`；本地上传同一 zip 则完整。
2. Windows 详情页删除技能时，内容已删但常留下空目录，并 toast「卸载失败」`ENOTEMPTY`。

## Goal

- 规范化/注入 displayName 后仍保留 zip 内与 `SKILL.md` 同层的全部文件与目录。
- Windows 卸载可靠删除技能目录，成功时不误报失败。

## Acceptance

- 扁平 zip（根级 `SKILL.md` + `docs/` + `scripts/`）经 `preferredDisplayName` 安装后，目标技能目录含全部附属路径。
- 嵌套 zip（`name/SKILL.md` + `name/docs/...`）行为不变。
- `uninstallSkill` 在 Windows 常见锁/竞态下重试删除；目录不存在或最终删净视为成功。
- 删除过程尽量释放 skills 目录 watcher 对该路径的占用。

## Non-Goals

- 不改市场上传链路产品交互。
- 不引入第三方删除库。
- 不批量修补已装丢文件的技能（需重装）。
