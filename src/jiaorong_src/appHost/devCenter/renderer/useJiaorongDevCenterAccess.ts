/** 侧栏「开发者中心」入口：仅开发者可见，跟随 OSS 名单响应式刷新。 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hydrateAppCenterAccess, isJiaorongDeveloper } from '../../../config/appCenterAccess'

/** 侧栏入口状态与行为。 */
export function useJiaorongDevCenterAccess() {
  /** Vue Router。 */
  const router = useRouter()
  /** 当前路由。 */
  const route = useRoute()

  /** 入口是否可见：仅开发者名单命中。 */
  const visible = computed(() => isJiaorongDeveloper())

  /** 是否停在开发者中心路由。 */
  const isActive = computed(() => route.name === 'jiaorong-dev-center')

  /** 跳转开发者中心页：与应用中心一样在主窗口内渲染。 */
  const open = async (): Promise<void> => {
    await router.push({ name: 'jiaorong-dev-center' })
  }

  // 挂载即点火后台拉名单，不阻塞首屏
  onMounted(hydrateAppCenterAccess)

  return { visible, isActive, open }
}
