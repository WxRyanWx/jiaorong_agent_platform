# skill-creator-default-dir

## Goal

`skill-creator` 创建的技能必须落在默认技能目录，创建后可立刻用 `/` 呼出。

## Approach

只改技能提示词（`resources/skills/skill-creator/SKILL.md`），并保留 `init_skill.py` 对默认目录的强制写入作为兜底。不改宿主代码。

## Acceptance

- 提示词明确：只能写到 `${SKILLS_DIR}`
- 本地使用不要求 package/install
- 完成后提示用户可立即 `/<skill-name>`
