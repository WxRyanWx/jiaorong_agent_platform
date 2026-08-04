# install-skill-from-zip-url

## Goal

在 `@jiaorong/utils` 提供：传入 zip 技能包 URL → 下载安装 → 返回成功/失败（失败带错误信息）。

## Acceptance

- `installSkillFromZipUrl(url)` 复用宿主 `installFromUrl`
- 返回 `{ success, error?, skillName? }`
- 成功时记录 `skill_source = Zip`

## Non-goals

- 不新增宿主 API
- 不做市场 UI
