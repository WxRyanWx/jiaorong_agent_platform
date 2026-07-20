# Mission: 熟练使用 Jiaorong CLI v1

## Why
能够在终端和自动化脚本中安全调用真实 JiaorongAI，完成文本任务、持续 Session 和受控文件工作，而不依赖桌面手工操作或误用未验收能力。

## Success looks like
- 独立完成安装、Doctor、模型发现和第一条真实任务
- 正确选择 text、json 或 stream-json，并可靠判断终止状态
- 使用 Session resume、文本 Attachment、Project Root、Additional Directory 和 Permission Mode
- 正确处理 timeout、Ctrl-C、Machine Error Code 和卸载

## Constraints
- 首版固定 Jiaorong CLI 0.1.0、JiaorongAI.app 0.5.6、macOS arm64、Node.js >=22
- 学习材料以当前仓库的代码、协议、验收证据和不可变 RC1 为准
- 每课都要产生一个可观察的终端结果

## Out of scope
- 图片 Attachment 的真实识别
- Shell、后台进程、Windows/Linux、自包含签名二进制
- 修改 JiaorongAI 源码、Provider 实现或数据库
