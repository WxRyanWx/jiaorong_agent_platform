import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import type { JiaorongMenuAppItem } from '../types'

export function useJiaorongMenuApps() {
  const router = useRouter()
  const apps = ref<JiaorongMenuAppItem[]>([])

  async function refresh() {
    try {
      apps.value = (await window.jiaorongApps?.listVisible()) ?? []
    } catch (error) {
      console.warn('[jiaorong-app] Failed to list apps', error)
      apps.value = []
    }
  }

  async function open(app: JiaorongMenuAppItem) {
    await router.push({ name: 'jiaorong-app', params: { appId: app.id } })
  }

  function isActive(app: JiaorongMenuAppItem, routeName: unknown, routeAppId: unknown) {
    return routeName === 'jiaorong-app' && routeAppId === app.id
  }

  function onAuthSessionChanged() {
    void refresh()
  }

  onMounted(() => {
    void refresh()
    window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  onUnmounted(() => {
    window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  })

  return { apps, refresh, open, isActive }
}
