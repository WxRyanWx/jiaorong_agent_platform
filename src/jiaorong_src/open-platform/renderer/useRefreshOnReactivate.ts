import { onActivated } from 'vue'

/**
 * 页面级 keep-alive 下组件不会随路由重新创建，从其它菜单切回来不会重新拉取数据。
 * 首次挂载交给组件自身的 onMounted，这里只处理「从缓存恢复」，避免重复请求。
 */
export function useRefreshOnReactivate(refresh: () => void | Promise<void>): void {
  let activationCount = 0

  /** 回到页面属于后台同步，失败只记录日志，不影响已有卡片内容。 */
  async function runQuietly(): Promise<void> {
    try {
      await refresh()
    } catch (error) {
      console.warn('[open-platform] reactivate sync failed', error)
    }
  }

  onActivated(() => {
    // 首次挂载同样会触发 activated，跳过以免与 onMounted 的首次加载重复
    activationCount += 1
    if (activationCount > 1) void runQuietly()
  })
}
