<script setup lang="ts">
defineOptions({ name: 'OpenPlatformPage' })

import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@arco-design/web-vue'
import { getOpenPlatformClient } from '../api'
import { createClientAppCapabilities } from './clientAppCapabilities'
import AppsPane from './AppsPane.vue'
import AssetPane from './AssetPane.vue'
import '../styles/open-platform.less'

type OpenPlatformTab = 'home' | 'apps' | 'skills' | 'connectors'

const TAB_STORAGE_KEY = 'jiaorong-open-platform-tab:v1'
const VALID_TABS: OpenPlatformTab[] = ['home', 'apps', 'skills', 'connectors']

const { t } = useI18n()
const activeTab = ref<OpenPlatformTab>('home')
const api = getOpenPlatformClient()
const capabilities = createClientAppCapabilities()

const TABS: Array<{ key: OpenPlatformTab; icon: string }> = [
  { key: 'home', icon: 'lucide:house' },
  { key: 'apps', icon: 'lucide:layout-grid' },
  { key: 'skills', icon: 'lucide:sparkles' },
  { key: 'connectors', icon: 'lucide:plug' }
]

function readStoredTab(): OpenPlatformTab {
  const value = localStorage.getItem(TAB_STORAGE_KEY)
  return VALID_TABS.includes(value as OpenPlatformTab) ? (value as OpenPlatformTab) : 'home'
}

onMounted(() => {
  activeTab.value = readStoredTab()
})

watch(activeTab, (tab) => {
  localStorage.setItem(TAB_STORAGE_KEY, tab)
})
</script>

<template>
  <section class="open-platform-page">
    <header class="open-platform-page__header">
      <div>
        <h1 class="open-platform-page__title">{{ t('routes.openPlatform') }}</h1>
        <p class="open-platform-page__subtitle">{{ t('routes.openPlatformSubtitle') }}</p>
      </div>
      <nav class="open-platform-page__tabs" aria-label="open platform tabs">
        <Button
          v-for="tab in TABS"
          :key="tab.key"
          type="text"
          size="small"
          class="open-platform-page__tab"
          :class="{ 'is-active': activeTab === tab.key }"
          :data-testid="`open-platform-tab-${tab.key}`"
          @click="activeTab = tab.key"
        >
          <Icon :icon="tab.icon" />
          <span>{{ t(`routes.openPlatformTab_${tab.key}`) }}</span>
        </Button>
      </nav>
      <div class="open-platform-page__header-spacer" aria-hidden="true" />
    </header>

    <main class="open-platform-page__content">
      <div v-if="activeTab === 'home'" class="open-platform-page__placeholder">
        <Icon icon="lucide:layout-panel-top" />
        <p>{{ t('routes.openPlatformHomePlaceholder') }}</p>
      </div>
      <AppsPane v-else-if="activeTab === 'apps'" :api="api" :capabilities="capabilities" />
      <AssetPane v-else-if="activeTab === 'skills'" :api="api" asset-type="skill" />
      <AssetPane v-else :api="api" asset-type="connector" />
    </main>
  </section>
</template>
