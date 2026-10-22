# 实现方案

移除脚手架的 `slot` 用户入口：删除问答项、CLI 值参数、`menu` 校验规则和帮助文案；归一化配置时固定写 `app-center`。生成摘要与说明文案改称“应用市场”，包版本升级为 `0.1.2` 后发布到 npm。

## 影响范围

- `tools/create-jiaorong-app/bin/create-jiaorong-app.js`
- `tools/create-jiaorong-app/lib/prompts.js`
- `tools/create-jiaorong-app/lib/rules.js`
- `tools/create-jiaorong-app/lib/replace.js`
- `tools/create-jiaorong-app/lib/scaffold.js`
- `tools/create-jiaorong-app/README.md`
- `tools/create-jiaorong-app/app-scaffold/README.md`
- `tools/create-jiaorong-app/package.json`

## 验证

- `--help` 不显示 `--slot`。
- 传 `--slot app-center` 会按未知参数退出。
- `--yes --no-install` 生成项目后检查 `app.json`。
- `npm pack --dry-run` 检查发包内容。
