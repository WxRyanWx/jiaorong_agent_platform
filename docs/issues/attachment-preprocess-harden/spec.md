# Attachment preprocess harden (path / size)

## User Need

降低旁路识图被伪造附件 path 外泄、超大内存图拖垮的风险。

## Goal

- 磁盘读图：realpath 后校验允许根目录，并以图片魔数校验；拒绝把任意非图片文件当图读出
- 内存 data URL / base64：同样套 `MAX_VISION_IMAGE_BYTES`
- 单轮识图张数不设上限（费用/耗时可接受）

## Acceptance Criteria

- path 指向非图片敏感文件（无图片魔数 / 不在允许目录）时不读入 VL
- 超大 data URL / base64 返回不可读并带原因
- 本轮挂多少张可用图就识多少张（无数量硬顶）

## Constraints

- 逻辑留在 `jiaorong_staging/attachmentPreprocess`
- 不改渲染层上传 UI

## Non-goals

- 不全局改造 IPC 附件信任模型
- 不引入文档解析服务
