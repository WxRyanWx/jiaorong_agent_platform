# default-skills-seed

## Goal

安装事件后补装默认市场技能。打包时自动生成随机 `DEFAULT_SKILLS_SEED_BUILD_ID`，同版本覆盖安装也会触发补缺；日常启动（dev 用固定 `dev`）不重复跑。

## Acceptance

- 清单 19 个市场技能；内置 14 由宿主同步
- `pnpm run build` / `prebuild` 调用私有脚本生成随机 build id 写入 `defaultSkillsSeedBuildId.generated.ts`
- 闸门：localStorage `jiaorongDefaultSkillsSeedBuildId` ↔ 包内常量
- 已装跳过；失败不写闸门

## Non-Goals

- 不改开源宿主 IPC
- 开发模式不强制每次 HMR 重装（generated 默认为 `dev`）
