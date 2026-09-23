/** 侧栏「开发者中心」入口：所有人可见，只维护高亮与跳转。 */

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** 侧栏入口状态与行为。 */
export function useJiaorongDevCenterAccess() {
  /** Vue Router。 */
  const router = useRouter()
  /** 当前路由。 */
  const route = useRoute()

  /** 是否停在开发者中心路由。 */
  const isActive = computed(() => route.name === 'jiaorong-dev-center')

  /** 跳转开发者中心页：与应用中心一样在主窗口内渲染。 */
  const open = async (): Promise<void> => {
    await router.push({ name: 'jiaorong-dev-center' })
  }

  return { isActive, open }
}
