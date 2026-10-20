/** 侧栏「开放平台」入口：仅开发者可见，跟随 OSS 名单响应式刷新。 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hydrateAppCenterAccess, isJiaorongDeveloper } from '../../config/appCenterAccess'

export function useOpenPlatformAccess() {
  const router = useRouter()
  const route = useRoute()

  const visible = computed(() => isJiaorongDeveloper())
  const isActive = computed(() => route.name === 'jiaorong-open-platform')

  const open = async (): Promise<void> => {
    await router.push({ name: 'jiaorong-open-platform' })
  }

  onMounted(hydrateAppCenterAccess)

  return { visible, isActive, open }
}
