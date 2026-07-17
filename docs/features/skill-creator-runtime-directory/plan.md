# Implementation Plan

1. Update `skill-creator/SKILL.md` to make the runtime skills directory an invariant and provide an
   absolute-path command.
2. Add deterministic name and output-path validation to `init_skill.py`.
3. Exercise successful creation in a temporary absolute directory and verify rejection of relative
   paths and invalid names.

No new IPC or main-process route is required because `${SKILLS_DIR}` is already expanded by
`SkillPresenter` before the skill instructions are supplied to the agent.
