# 方案

## 数据流

`ConfigPresenter` 构造 → `initTheme()` → 读 `appTheme` → 非 `light` 则 `setSetting('appTheme','light')` → 始终 `nativeTheme.themeSource = 'light'` → 各窗口 renderer `themeStore` 读到 light。

不走完整 `setTheme`：构造早于 `Presenter`，避免访问未就绪的 `floatingButtonPresenter`。

## 改动

| 文件 | 内容 |
|------|------|
| `jiaorong_src/brand/forceLightTheme.ts` | `FORCED_THEME_MODE`、`needsForceLightTheme` |
| `jiaorong_src/brand/index.ts` | re-export |
| `configPresenter/index.ts` `initTheme` | 启动强制浅色（只写配置 + nativeTheme） |
| `HOST_TOUCHPOINTS.md` | 登记触点 |

## 测试

手动：设 dark → 重启 → 浅色；设 light → 重启仍浅色。
