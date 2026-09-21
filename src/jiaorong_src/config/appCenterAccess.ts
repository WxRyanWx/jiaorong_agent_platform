import { shallowRef } from 'vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '../auth/lib/sessionEvents'
import { matchesIdentityWhitelist } from './identityWhitelist'
import {
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig
} from './remoteRuntimeConfig'
import { readStoredUserInfo } from './storedUserInfo'

/** 应用中心可见名单；默认空，OSS 拉到后才有人。 */
const appCenterVisibleRef = shallowRef<readonly string[]>([])
/** 开发者名单；默认空。 */
const developerRef = shallowRef<readonly string[]>([])
/** 登录态变化时递增，让入口 computed 重读 localStorage。 */
const identityTick = shallowRef(0)
/** 是否已监听登录事件。 */
let identityListenerBound = false

/** 写入两份名单；供订阅回调与测试使用。 */
export const applyAppCenterAccess = (
  visible: readonly string[],
  developers: readonly string[]
): void => {
  appCenterVisibleRef.value = [...visible]
  developerRef.value = [...developers]
}

let accessHydrated = false

/** 后台拉应用中心名单，不阻塞首屏；失败保持空名单。 */
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

/** 当前用户是否可见应用中心入口；开发者同样可进。 */
export const isJiaorongAppCenterVisible = (): boolean => {
  void identityTick.value
  return (
    matchesIdentityWhitelist(appCenterVisibleRef.value, readStoredUserInfo()) ||
    isJiaorongDeveloper()
  )
}

/** 测试用：清空名单。 */
export const resetAppCenterAccessForTests = (): void => {
  applyAppCenterAccess([], [])
}
