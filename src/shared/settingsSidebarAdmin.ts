import type { SettingsNavigationItem } from './settingsNavigation'

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
  'settings-skills',
  'settings-prompt',
  'settings-knowledge-base',
  'settings-database'
]

/** userName / phone values from localStorage `userInfo`; whitelisted users unlock admin UI */
export const SETTINGS_SIDEBAR_ADMIN_WHITELIST: string[] = [
  '13039619789',
  'L20184974',
  '2025004990',
  '15225192364'
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

export const isSettingsSidebarItemVisuallyHidden = (routeName: string): boolean => {
  if (isSettingsSidebarAdmin()) {
    return false
  }

  return SETTINGS_SIDEBAR_HIDDEN_ROUTE_SET.has(routeName as SettingsNavigationItem['routeName'])
}
