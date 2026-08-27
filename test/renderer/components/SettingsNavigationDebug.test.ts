import { describe, expect, it } from 'vitest'
import {
  getSettingsNavigationGroups,
  getSettingsRouteItems,
  resolveSettingsNavigationPath
} from '@shared/settingsNavigation'
import {
  getDefaultSettingsRouteName,
  isForbiddenSettingsLandingRoute,
  isSettingsSidebarItemVisuallyHidden,
  isSettingsSpotlightItemHidden,
  isMainSidebarItemHidden,
  MAIN_SIDEBAR_ADMIN_ONLY_ROUTES,
  SETTINGS_SIDEBAR_HIDDEN_ROUTES,
  SETTINGS_SPOTLIGHT_HIDDEN_ROUTES
} from '@shared/settingsSidebarAdmin'

describe('debug settings navigation', () => {
  it('groups environment management with setup settings', () => {
    const setupGroup = getSettingsNavigationGroups().find((group) => group.key === 'setup')
    const modelsGroup = getSettingsNavigationGroups().find((group) => group.key === 'models')

    expect(setupGroup?.items.some((item) => item.routeName === 'settings-environments')).toBe(true)
    expect(modelsGroup?.items.some((item) => item.routeName === 'settings-environments')).toBe(
      false
    )
  })

  it('exposes the debug route and system navigation item only in development mode', () => {
    expect(getSettingsRouteItems().some((item) => item.routeName === 'settings-debug')).toBe(false)
    expect(resolveSettingsNavigationPath('settings-debug')).toBe('/deepchat-agents')

    expect(
      getSettingsRouteItems(undefined, undefined, true).some(
        (item) => item.routeName === 'settings-debug'
      )
    ).toBe(true)
    expect(
      resolveSettingsNavigationPath('settings-debug', undefined, undefined, undefined, true)
    ).toBe('/debug')
    expect(
      getSettingsNavigationGroups(undefined, undefined, true)
        .find((group) => group.key === 'system')
        ?.items.some((item) => item.routeName === 'settings-debug')
    ).toBe(true)
  })

  it('visually hides the debug settings item for non-admin users', () => {
    expect(isSettingsSidebarItemVisuallyHidden('settings-debug')).toBe(true)
    expect(isSettingsSidebarItemVisuallyHidden('settings-ocr')).toBe(true)
  })

  it('hides the same routes from non-admin default spotlight as the settings sidebar', () => {
    expect(SETTINGS_SPOTLIGHT_HIDDEN_ROUTES).toEqual(SETTINGS_SIDEBAR_HIDDEN_ROUTES)
    expect(isSettingsSpotlightItemHidden('settings-provider')).toBe(true)
    expect(isSettingsSpotlightItemHidden('settings-ocr')).toBe(true)
    expect(isSettingsSpotlightItemHidden('settings-mcp')).toBe(true)
    expect(isSettingsSpotlightItemHidden('settings-plugins')).toBe(true)
    expect(isSettingsSpotlightItemHidden('settings-knowledge-base')).toBe(true)
    expect(isSettingsSpotlightItemHidden('settings-shortcut')).toBe(false)
    expect(isSettingsSpotlightItemHidden('settings-common')).toBe(false)
  })

  it('does not hide admin-only routes from non-admin spotlight once a search query is present', () => {
    const withQuery = { hasQuery: true }
    expect(isSettingsSpotlightItemHidden('settings-provider', withQuery)).toBe(false)
    expect(isSettingsSpotlightItemHidden('settings-ocr', withQuery)).toBe(false)
    expect(isSettingsSpotlightItemHidden('settings-mcp', withQuery)).toBe(false)
    expect(isSettingsSpotlightItemHidden('settings-plugins', withQuery)).toBe(false)
    expect(isSettingsSpotlightItemHidden('settings-knowledge-base', withQuery)).toBe(false)
  })

  it('hides the main sidebar plugins entry for non-admin users', () => {
    expect(MAIN_SIDEBAR_ADMIN_ONLY_ROUTES).toEqual(['plugins'])
    expect(isMainSidebarItemHidden('plugins')).toBe(true)
    expect(isMainSidebarItemHidden('chat')).toBe(false)
  })

  it('defaults non-admin settings landing to common instead of overview', () => {
    expect(getDefaultSettingsRouteName()).toBe('settings-common')
    expect(isForbiddenSettingsLandingRoute('settings-overview')).toBe(true)
    expect(isForbiddenSettingsLandingRoute('settings-dashboard')).toBe(true)
    expect(isForbiddenSettingsLandingRoute('settings-common')).toBe(false)
    expect(isForbiddenSettingsLandingRoute('settings-display')).toBe(false)
  })
})
