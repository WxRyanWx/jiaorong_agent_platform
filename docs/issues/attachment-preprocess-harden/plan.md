# Plan

1. `config.ts`：保留单张 `MAX_VISION_IMAGE_BYTES`；不做张数硬顶。
2. `fileHelpers.ts`：data URL/base64 字节上限；path 读：`realpath` + allowlist + 图片魔数。
3. 单测覆盖：超大 data URL、非图片 / 目录外 path；无张数截断用例。
