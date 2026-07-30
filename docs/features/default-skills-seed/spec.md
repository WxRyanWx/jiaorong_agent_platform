# default-skills-seed

## Goal

安装/覆盖安装后补装默认市场技能。打包生成随机 build id；**chat / 技能页**进入时检测并静默补缺，不依赖「启动后 120s 内必须登录」。

## Acceptance

- 清单 19 个市场技能；内置 14 由宿主同步
- 打包生成 `DEFAULT_SKILLS_SEED_BUILD_ID`
- 触发：启动挂载 + `chat` / `skills` / `skills-detail` 路由 + 密码/deeplink 登录后
- 路由触发 `authWaitMs: 0`（已进业务页通常已有 token）
- 闸门未写时（曾因无 token 跳过）进入 chat 会再跑
- 同构建号已成功则 skip，不卡技能页

## Non-Goals

- 不改开源 ChatPage 本体（用 router.afterEach）
- 不强制重装已存在技能
