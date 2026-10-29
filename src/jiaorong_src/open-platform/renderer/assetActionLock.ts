/**
 * 开放平台资产动作互斥：同一条资产的发布 / 更新 / 下架 / 移除全局只跑一份。
 * 面板是 tab 级 `v-if`，切走即卸载，组件内的 loading ref 会跟着丢；
 * 锁放在模块级，切回来再点也不会重复提交（后端不保证幂等，重复发布会多出一个版本）。
 */

import { ref } from 'vue'

/** 在飞动作变化计数：让渲染侧 computed 能感知锁状态，卸载重建后按钮仍然是禁用态。 */
export const assetActionFlightVersion = ref(0)

/** 正在执行的动作键 → 进行中的任务。 */
const runningTasks = new Map<string, Promise<unknown>>()

/**
 * 动作键：资产类型 + 资产 id。
 * @param assetType 资产类型
 * @param assetId 资产 id
 */
export function buildAssetActionKey(assetType: string, assetId: string): string {
  return `${assetType}:${assetId.trim()}`
}

/**
 * 该资产是否有动作在飞。
 * @param key 动作键
 */
export function isAssetActionInFlight(key: string): boolean {
  return runningTasks.has(key)
}

/**
 * 同一条资产的动作互斥：已在飞就把同一个 promise 再给一次，不再发第二份请求。
 * @param key 动作键
 * @param task 真正的动作逻辑
 */
export function runExclusiveAssetAction<T>(key: string, task: () => Promise<T>): Promise<T> {
  const pending = runningTasks.get(key) as Promise<T> | undefined
  if (pending) return pending
  const run = task().finally(() => {
    runningTasks.delete(key)
    assetActionFlightVersion.value += 1
  })
  runningTasks.set(key, run)
  assetActionFlightVersion.value += 1
  return run
}

/** 测试用：清空在飞任务表。 */
export function resetAssetActionLockForTests(): void {
  runningTasks.clear()
  assetActionFlightVersion.value = 0
}
