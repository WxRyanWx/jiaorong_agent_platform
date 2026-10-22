# create-jiaorong-app 固定应用市场

## 需求

脚手架不再让用户选择发布位置，生成的交融应用固定挂载到应用市场，`app.json` 的 `slot` 固定为 `app-center`。

## 验收标准

- 交互问答中不再出现挂载位置问题。
- CLI 不再支持 `--slot` 参数。
- 生成结果 `app.json` 始终写入 `"slot": "app-center"`。
- 帮助文档与 README 不再宣传 `menu` 选项。

## 非目标

- 不修改客户端对 `menu` 与 `app-center` 的兼容解析。
- 不修改应用模板的其它字段与构建流程。

## 待确认

无。
