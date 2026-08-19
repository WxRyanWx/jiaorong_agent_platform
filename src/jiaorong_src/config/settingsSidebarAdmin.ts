import type { SettingsNavigationItem } from '@shared/settingsNavigation'

/** Sidebar routes kept in DOM but visually hidden for non-admin users */
export const SETTINGS_SIDEBAR_HIDDEN_ROUTES: SettingsNavigationItem['routeName'][] = [
  'settings-overview',
  'settings-provider',
  'settings-acp',
  'settings-dashboard',
  'settings-mcp',
  'settings-remote',
  'settings-notifications-hooks',
  'settings-scheduled-tasks',
  'settings-plugins',
  'settings-prompt',
  'settings-knowledge-base',
  'settings-database',
  'settings-debug'
]

/** userName / phone values from localStorage `userInfo`; whitelisted users unlock admin UI */
export const SETTINGS_SIDEBAR_ADMIN_WHITELIST: string[] = [
  '13039619789',
  'L20184974',
  '2025004990',
  '15225192364',
  '17376565448',
  '15738853677'
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

export const isSettingsSidebarAdmin = (): boolean => {
  const { userName, phone } = getStoredUserInfo()
  return [userName, phone].some(
    (value) => value !== null && SETTINGS_SIDEBAR_ADMIN_WHITELIST.includes(value)
  )
}

export const SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME = {
  admin: 'settings-overview',
  user: 'settings-common'
} as const satisfies Record<'admin' | 'user', SettingsNavigationItem['routeName']>

export const getDefaultSettingsRouteName = (): SettingsNavigationItem['routeName'] =>
  isSettingsSidebarAdmin()
    ? SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME.admin
    : SETTINGS_SIDEBAR_DEFAULT_ROUTE_NAME.user

export const isForbiddenSettingsLandingRoute = (
  routeName: string | symbol | null | undefined
): boolean => {
  if (isSettingsSidebarAdmin() || typeof routeName !== 'string') {
    return false
  }

  return routeName === 'settings-overview' || routeName === 'settings-dashboard'
}

export const isSettingsSidebarItemVisuallyHidden = (routeName: string): boolean => {
  if (isSettingsSidebarAdmin()) {
    return false
  }

  return SETTINGS_SIDEBAR_HIDDEN_ROUTE_SET.has(routeName as SettingsNavigationItem['routeName'])
}
