/** 交融强制浅色主题：产品已隐藏色调入口，启动时统一 light */

export const FORCED_THEME_MODE = 'light' as const

export type AppThemeMode = 'dark' | 'light' | 'system'

/** 当前配置是否已是强制浅色 */
export function isForcedLightTheme(theme: string | null | undefined): boolean {
  return theme === FORCED_THEME_MODE
}

/** 启动时是否需要写回 light（含 dark / system / 空） */
export function needsForceLightTheme(theme: string | null | undefined): boolean {
  return !isForcedLightTheme(theme)
}
