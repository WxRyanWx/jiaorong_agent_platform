/** 侧栏「应用中心」入口：可见性 / 高亮 / 跳转 / 图标，跟随 OSS 名单响应式刷新。 */

import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  hydrateAppCenterAccess,
  isJiaorongAppCenterVisible
} from '../../../config/appCenterAccess'
import appCenterIcon from '../../../assets/应用中心.svg?url'

/** 侧栏入口状态与行为。 */
export function useJiaorongAppCenterAccess() {
  /** Vue Router。 */
  const router = useRouter()
  /** 当前路由。 */
  const route = useRoute()

  /** 入口是否可见：白名单或开发者。 */
  const visible = computed(() => isJiaorongAppCenterVisible())

  /** 是否停在应用中心路由。 */
  const isActive = computed(() => route.name === 'jiaorong-app-center')

  /** 跳转应用中心。 */
  const open = async (): Promise<void> => {
    await router.push({ name: 'jiaorong-app-center' })
  }

  // 挂载即点火后台拉名单，不阻塞首屏
  onMounted(hydrateAppCenterAccess)

  return { visible, isActive, open, iconSrc: appCenterIcon }
}
