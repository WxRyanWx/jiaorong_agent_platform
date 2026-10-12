# Context 返回客户端版本

## 目标

子应用通过 `jr.getContext()` 和 `context` 事件获取当前 JiaorongAI 客户端版本号。

## 验收

- `context.get` 出参新增 `clientVersion: string`。
- 登录、主题、组织等触发 `context` 事件时，版本号随上下文一起下发。
- 现有上下文字段和行为不变。

## 非目标

- 不新增客户端更新检查 API。
