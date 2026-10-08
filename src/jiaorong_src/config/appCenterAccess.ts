import { shallowRef } from 'vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '../auth/lib/sessionEvents'
import { allowsIdentityByOptionalWhitelist, matchesIdentityWhitelist } from './identityWhitelist'
import {
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig
} from './remoteRuntimeConfig'
import { readStoredUserInfo } from './storedUserInfo'

/**
 * 应用中心可见名单。
 * null：配置已到但没写字段，全员可见。
 * 数组：只这些身份可见。
 * 尚未拉到配置时 known 为 false，入口先隐藏。
 */
const appCenterVisibleRef = shallowRef<readonly string[] | null>(null)
/** 是否已经用上一次成功的 OSS 配置。 */
const appCenterVisibilityKnown = shallowRef(false)
/** 开发者名单；默认空。 */
const developerRef = shallowRef<readonly string[]>([])
/** 登录态变化时递增，让入口 computed 重读 localStorage。 */
const identityTick = shallowRef(0)
/** 是否已监听登录事件。 */
let identityListenerBound = false

/** 写入两份名单；供订阅回调与测试使用。visible 为 null 表示没配可见名单。 */
export const applyAppCenterAccess = (
  visible: readonly string[] | null,
  developers: readonly string[]
): void => {
  appCenterVisibleRef.value = visible === null ? null : [...visible]
  developerRef.value = [...developers]
  appCenterVisibilityKnown.value = true
}

let accessHydrated = false

/** 后台拉应用中心名单，不阻塞首屏；失败保持入口隐藏。 */
export const hydrateAppCenterAccess = (): void => {
  if (accessHydrated) return
  accessHydrated = true
  subscribeJiaorongRemoteRuntimeConfig((config) => {
    applyAppCenterAccess(config.appCenterVisiblePhones, config.developerPhones)
  })
  startJiaorongRemoteRuntimeConfigSync()
  if (typeof window === 'undefined' || identityListenerBound) return
  identityListenerBound = true
  window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, () => {
    identityTick.value += 1
  })
}

/** 当前用户是否为开发者。 */
export const isJiaorongDeveloper = (): boolean => {
  void identityTick.value
  return matchesIdentityWhitelist(developerRef.value, readStoredUserInfo())
}

/**
 * 当前用户是否可见应用中心入口。
 * 配置未到先隐藏；没写 appCenterVisiblePhones 则全员可见；写了则只命中名单的人可见。
 * 开发者名单不另开入口。
 */
export const isJiaorongAppCenterVisible = (): boolean => {
  void identityTick.value
  if (!appCenterVisibilityKnown.value) return false
  return allowsIdentityByOptionalWhitelist(appCenterVisibleRef.value, readStoredUserInfo())
}

/** 测试用：回到「配置未到」的隐藏状态。 */
export const resetAppCenterAccessForTests = (): void => {
  appCenterVisibleRef.value = null
  developerRef.value = []
  appCenterVisibilityKnown.value = false
}
