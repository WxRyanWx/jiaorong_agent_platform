import appsManages from './appsManages'
import { getUserAppsRoot } from './paths'

/** 共享管理器；安装 / 卸载 / spawn 共用一份缓存。 */
let sharedManager: appsManages | null = null

/** 本进程应用管理器单例，安装根目录取自用户 apps 目录。 */
export function sharedAppsManager(): appsManages {
  if (!sharedManager) sharedManager = new appsManages(getUserAppsRoot())
  return sharedManager
}
