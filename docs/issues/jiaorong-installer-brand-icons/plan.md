# 计划

- 用 `resources/icon.png` 覆盖 `build/icon.png`，套用现有 icns 圆角 alpha，再生成 `.ico` / `.icns`。
- Windows `.ico` 必须从 1024 PNG 导出 16/24/32/48/64/128/256，禁止只含 72×72 单档。
- 按现有 DMG `contents` 坐标重绘 `dmg-background.png` 与 `@2x`，顶标与文案换成交融 / JiaorongAI。
- 测试：图标中心像素贴近交融源图；DMG 尺寸与 electron-builder 布局合同保持。
