# jiaorong-host-thinning-p0

## Goal

继续把交融私有配置/资源迁入 `jiaorong_src`，缩小开源宿主 diff。

## 明确不迁

- **设置 → 提示词管理页面**（UI / CRUD / ElectronStore 流程）：留在宿主。合上游与设置壳强绑定，整页迁私有包不合适。
- 仅迁 **默认系统提示词文案常量**（`DEFAULT_SYSTEM_PROMPT`），供宿主 `SystemPromptHelper` 引用。

## Acceptance

- SM4 脚本离开 `renderer/public` + `index.html` 全局加载，改为登录加密路径按需加载
- `settingsSidebarAdmin` 实体在 `jiaorong_src`，宿主 `@shared` 薄 re-export
- `DEFAULT_SYSTEM_PROMPT` 在 `jiaorong_src/prompts`
- HOST_TOUCHPOINTS 更新
- 给出验证名单

## Non-Goals

- 迁提示词设置页 / 整份 SystemPromptHelper 类
- WindowSideBar registry 注入（下一切片）
- deeplinkPresenter 整迁
