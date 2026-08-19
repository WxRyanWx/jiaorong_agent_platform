import '@/assets/main.css'
import '@jiaorong/brand/theme.less'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'

import App from './App.vue'
import { createRendererI18n } from '@/i18n/bootstrap'
import { getSettingsRouteItems, resolveSettingsNavigationPath } from '@shared/settingsNavigation'
import {
  getDefaultSettingsRouteName,
  isForbiddenSettingsLandingRoute
} from '@jiaorong/config/settingsSidebarAdmin'
import { preloadIcons } from '../src/lib/iconLoader'
import { createConfigClient } from '@api/ConfigClient'
import { getRuntimeArch, getRuntimePlatform } from '@api/runtime'
import { settingsRouteComponents } from './settingsRouteComponents'

const runtimePlatform = getRuntimePlatform()
const runtimeArch = getRuntimeArch()
const settingsRouteItems = getSettingsRouteItems(runtimePlatform, runtimeArch, import.meta.env.DEV)
const defaultSettingsRouteName = getDefaultSettingsRouteName()
const defaultSettingsPath = resolveSettingsNavigationPath(
  defaultSettingsRouteName,
  undefined,
  runtimePlatform,
  runtimeArch,
  import.meta.env.DEV
)

// Create router instance specifically for settings
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    ...settingsRouteItems.map((item) =>
      item.routeName === 'settings-dashboard'
        ? {
            path: item.path,
            name: item.routeName,
            redirect: isForbiddenSettingsLandingRoute(item.routeName)
              ? { name: defaultSettingsRouteName }
              : {
                  name: 'settings-overview',
                  query: {
                    section: 'usage'
                  }
                },
            meta: {
              titleKey: item.titleKey,
              icon: item.icon,
              position: item.position
            }
          }
        : {
            path: item.path,
            name: item.routeName,
            component: settingsRouteComponents[item.routeName],
            meta: {
              titleKey: item.titleKey,
              icon: item.icon,
              position: item.position
            }
          }
    ),
    {
      path: '/',
      redirect: defaultSettingsPath
    }
  ]
})

router.beforeEach((to) => {
  if (!isForbiddenSettingsLandingRoute(to.name) || to.name === defaultSettingsRouteName) {
    return true
  }

  return { name: defaultSettingsRouteName }
})

async function bootstrap() {
  const configClient = createConfigClient()
  const { i18n, languageState } = await createRendererI18n({
    getLanguageState: () => configClient.getLanguageState()
  })

  document.documentElement.dir = languageState.direction === 'rtl' ? 'rtl' : 'auto'

  const pinia = createPinia()
  const app = createApp(App)

  app.use(pinia)
  app.use(PiniaColada, {
    queryOptions: {
      staleTime: 30_000,
      gcTime: 300_000
    }
  })
  app.use(i18n)
  app.use(router)
  app.mount('#app')

  // Preload icons asynchronously after app mount to improve perceived startup time
  setTimeout(() => {
    preloadIcons().catch((error) => {
      console.error('Failed to preload icons:', error)
    })
  }, 0)
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap the settings renderer:', error)
})
