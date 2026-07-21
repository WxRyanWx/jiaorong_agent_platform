# 独立截图接入规范

## 目标

在 `scrrenshot-yanxia` 分支中接入 `screenshot-electron` 发布的独立可执行程序。交融私有实现位于
`src/jiaorong_src/screenshot`，开源宿主只保留必要触点。

## 验收条件

- 平台注册截图全局快捷键，截图程序自身不注册快捷键。
- Renderer 可通过 preload 请求打开截图。
- 开发环境支持 `JIAORONG_SCREENSHOT_EXECUTABLE` 覆盖路径。
- 构建只下载并打入当前平台与架构的一套 Release 运行时。
- 平台不安装截图程序内部的原生采集或 OCR 依赖。
- 启动失败和 CLI JSON 结果写入平台日志。
- 所有开源宿主改动登记在 `HOST_TOUCHPOINTS.md`。

## 非目标

- 向截图程序传递平台登录令牌。
- 将六套运行时提交到平台仓库或同时打入安装包。
- 在本次接入中消费 AI action。
