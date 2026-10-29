/** 应用中心安装互斥：同一个应用的安装任务全局只跑一份。 */

/** 安装结果的最小契约，具体字段由调用方决定。 */
export type AppInstallTaskResult = { ok: boolean; message?: string }

/** 正在安装的应用 id → 进行中的任务。 */
const installTasks = new Map<string, Promise<AppInstallTaskResult>>()

/**
 * 该应用是否有安装任务在飞：列表据此把卡片状态抬成「安装中」，
 * 渲染进程切走再切回（组件重建、本地 loading 丢失）也不会退回「安装」。
 * @param appId 应用 id
 */
export function isAppInstallInFlight(appId: string): boolean {
  return installTasks.has(appId)
}

/**
 * 同一个应用的安装互斥：已在飞就把同一个 promise 再给一次。
 * 否则重复点击会并行下载两份包、先后覆盖同一个安装目录，白跑一遍还可能装到半份内容。
 * @param appId 应用 id
 * @param task 真正的安装逻辑
 */
export function runExclusiveAppInstall<T extends AppInstallTaskResult>(
  appId: string,
  task: () => Promise<T>
): Promise<T> {
  /** 已在飞的同 id 任务。 */
  const pending = installTasks.get(appId) as Promise<T> | undefined
  if (pending) return pending
  /** 本次任务；无论成功失败都要摘掉，避免卡片永久停在「安装中」。 */
  const run = task().finally(() => {
    installTasks.delete(appId)
  })
  installTasks.set(appId, run)
  return run
}

/** 测试用：清空在飞任务表。 */
export function resetAppInstallLockForTests(): void {
  installTasks.clear()
}
