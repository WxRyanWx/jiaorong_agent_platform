# 计划

- 恢复 `loader-stage` 的 aurora 圆底、bloom、扫描线。
- 圆底/丝带/光晕改成交融色：近黑底、`#0066FF` 电蓝、`#00E5FF` 青，去掉紫和 slate 描边。
- PNG 黑底用内联 `filter: url(#id)` 抠掉（不要写进 scoped CSS，打包外链样式会解析失败）；defs 放在 splash 根上，加载/解锁共用。
- 更新测例：加载态包含 aurora；断言 logo src 与 knockout filter。
