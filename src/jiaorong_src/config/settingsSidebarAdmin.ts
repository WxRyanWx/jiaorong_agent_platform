import type { SettingsNavigationItem } from '@shared/settingsNavigation'

/** 非管理员侧栏仍保留 DOM，仅视觉隐藏的路由 */
export const SETTINGS_SIDEBAR_HIDDEN_ROUTES: SettingsNavigationItem['routeName'][] = [
  'settings-overview',
  'settings-provider',
  'settings-acp',
  'settings-dashboard',
  'settings-mcp',
  'settings-ocr',
  'settings-remote',
  'settings-notifications-hooks',
  'settings-scheduled-tasks',
  'settings-plugins',
  'settings-prompt',
  'settings-knowledge-base',
  'settings-database',
  'settings-debug'
]

/** 非管理员 Spotlight 默认面板与侧栏使用同一隐藏名单；有搜索词时不隐藏（后门） */
export const SETTINGS_SPOTLIGHT_HIDDEN_ROUTES = SETTINGS_SIDEBAR_HIDDEN_ROUTES

/** 从 localStorage `userInfo` 读取的 userName / phone；命中白名单即管理员 */
export const SETTINGS_SIDEBAR_ADMIN_WHITELIST: string[] = [
  // '13039619789',
  // 'L20184974',
  // '2025004990',
  // '15225192364',
  // '17376565448',
  // '15738853677',
  // '18229040744',
]

const SETTINGS_SIDEBAR_HIDDEN_ROUTE_SET = new Set(SETTINGS_SIDEBAR_HIDDEN_ROUTES)

const getStoredUserInfo = (): {
  userName: string | null
  phone: string | null
} => {
  try {
    const raw = localStorage.getItem('userInfo')
    if (!raw) {
      return { userName: null, phone: null }
    }
    const parsed = JSON.parse(raw) as {
      userName?: unknown
      phone?: unknown
    }
    return {
      userName: typeof parsed?.userName === 'string' ? parsed.userName : null,
      phone: typeof parsed?.phone === 'string' ? parsed.phone : null
    }
  } catch {
    return { userName: null, phone: null }
  }
}

/** 当前用户是否为设置页管理员 */
export const isSettingsSidebarAdmin = (): boolean => {
  const { userName, phone } = getStoredUserInfo()
  return [userName, phone].some(
    (value) => value !== null && SETTINGS_SIDEBAR_ADMIN_WHITELIST.includes(value)
  )
}

/** 管理员 / 普通用户打开设置时的默认落地路由 */
export const SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME = {
  admin: 'settings-overview',
  user: 'settings-common'
} as const satisfies Record<'admin' | 'user', SettingsNavigationItem['routeName']>

/** 按当前身份返回设置窗口默认落地路由 */
export const getDefaultSettingsRouteName = (): SettingsNavigationItem['routeName'] =>
  isSettingsSidebarAdmin()
    ? SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME.admin
    : SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME.user

/** 非管理员禁止作为设置落地页的路由 */
export const isForbiddenSettingsLandingRoute = (
  routeName: string | symbol | null | undefined
): boolean => {
  if (isSettingsSidebarAdmin() || typeof routeName !== 'string') {
    return false
  }

  return routeName === 'settings-overview' || routeName === 'settings-dashboard'
}

/** 侧栏项是否应对非管理员视觉隐藏 */
export const isSettingsSidebarItemVisuallyHidden = (routeName: string): boolean => {
  if (isSettingsSidebarAdmin()) {
    return false
  }

  return SETTINGS_SIDEBAR_HIDDEN_ROUTE_SET.has(routeName as SettingsNavigationItem['routeName'])
}

/**
 * Spotlight 是否应对非管理员隐藏该项。
 * 默认面板（无搜索词）与侧栏同一名单；有搜索词时不隐藏，给普通用户留后门。
 */
export const isSettingsSpotlightItemHidden = (
  routeName: string | null | undefined,
  options?: { hasQuery?: boolean }
): boolean => {
  if (typeof routeName !== 'string' || options?.hasQuery) {
    return false
  }

  return isSettingsSidebarItemVisuallyHidden(routeName)
}

/** 主窗口侧栏仅管理员可见的入口（路由名） */
export const MAIN_SIDEBAR_ADMIN_ONLY_ROUTES = ['plugins'] as const

const MAIN_SIDEBAR_ADMIN_ONLY_ROUTE_SET = new Set<string>(MAIN_SIDEBAR_ADMIN_ONLY_ROUTES)

/** 主窗口侧栏项是否应对非管理员隐藏 */
export const isMainSidebarItemHidden = (routeName: string): boolean => {
  if (isSettingsSidebarAdmin()) {
    return false
  }

  return MAIN_SIDEBAR_ADMIN_ONLY_ROUTE_SET.has(routeName)
}
