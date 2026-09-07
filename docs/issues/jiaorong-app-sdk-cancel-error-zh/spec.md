# 应用 SDK：停止生成不当成错误，错误文案中文

## 目标

手动停止生成时，对话顶部不再出现红色错误条。SDK Vue 组件、chat-kit 错误块、连接失败页把宿主 i18n key 和 SDK `JiaorongError` 显示成中文。

## 验收

1. 点停止后，顶部错误条不出现；消息里显示「已停止生成」，不是「请求失败」折叠块，也不是 `common.error.userCanceledGeneration`。
2. 真正失败时，标题和详情都是中文。
3. 直连页整页连接失败、组件 `errorText`、SDK throw 文案均为中文，不再带 `CODE:` 前缀或英文句子。

## 约束

- 不改 Super Agent 停止/落库逻辑。
- 脚手架仍不引用 chat-kit。
- 不升 catalog。
