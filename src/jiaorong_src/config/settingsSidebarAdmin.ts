import type { SettingsNavigationItem } from '@shared/settingsNavigation'
import { shallowRef } from 'vue'
import { matchesIdentityWhitelist } from './identityWhitelist'
import {
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig
} from './remoteRuntimeConfig'
import { readStoredUserInfo } from './storedUserInfo'

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

const adminWhitelistRef = shallowRef<string[]>([])

/** 当前管理员白名单。默认空；OSS 拉到后才有人。 */
export const getSettingsSidebarAdminWhitelist = (): readonly string[] => adminWhitelistRef.value

export const applySettingsSidebarAdminWhitelist = (ids: readonly string[]): void => {
  adminWhitelistRef.value = [...ids]
}

let adminWhitelistHydrated = false

/** 后台拉管理员名单，不阻塞首屏。失败保持空名单，成功后通过 shallowRef 刷新 UI。 */
export const hydrateSettingsSidebarAdminWhitelist = (): void => {
  if (!adminWhitelistHydrated) {
    adminWhitelistHydrated = true
    subscribeJiaorongRemoteRuntimeConfig((config) => {
      applySettingsSidebarAdminWhitelist(config.admins)
    })
  }
  startJiaorongRemoteRuntimeConfigSync()
}

const SETTINGS_SIDEBAR_HIDDEN_ROUTE_SET = new Set(SETTINGS_SIDEBAR_HIDDEN_ROUTES)

/** 当前用户是否为设置页管理员 */
export const isSettingsSidebarAdmin = (): boolean =>
  matchesIdentityWhitelist(adminWhitelistRef.value, readStoredUserInfo())

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
