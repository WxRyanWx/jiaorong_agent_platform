# CLI 找不到正在运行的主进程

## 目标

JiaorongAI 运行中时，CLI 能连上 `local-control`，不再误报主进程未运行。

## 验收

1. CLI 默认 userData 路径与 `app.setName('JiaorongAI')` 一致。
2. 智能体执行 `jiaorong`/`deepchat` CLI 时，注入当前主进程 `app.getPath('userData')`，不靠猜目录。
3. 问当前会话模型时，不依赖 CLI 去翻 `model-db/providers.json`。
4. 用户可见不可用文案使用 JiaorongAI，不再写 DeepChat。

## 非目标

- 不改 `DEEPCHAT_E2E_USER_DATA_DIR` 环境变量名。
- 不改白名单号码。
