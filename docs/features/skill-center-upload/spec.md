# Skill Center Upload

## Goal

技能中心「上传技能」弹窗：支持 `.zip` / 文件夹 / `.md`；仅校验格式；**全部在私有仓实现**，安装复用开源已有 `installFromFolder` / `installFromZip`，**不新增宿主 API**。

## Acceptance

- 点击「上传技能」打开弹窗
- zip / 文件夹：直接调 `skillsStore.installFromFolder|Zip`
- md：私有仓读文件 → 打成含 `SKILL.md` 的临时 zip（`filePresenter.writeTemp`）→ `installFromZip`
- 不改 `SkillPresenter` / routes / SkillClient

## Non-goals

- 不新增 `installFromMarkdown` 宿主方法
- 不扩展 `selectFiles({ allowDirectory })`
