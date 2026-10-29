<script setup lang="ts">
defineOptions({ name: 'OpenPlatformPage' })

import { onActivated, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { getOpenPlatformClient } from '@jiaorong/api/openPlatform'
import { createClientAppCapabilities } from './clientAppCapabilities'
import AppsPane from './AppsPane.vue'
import AssetPane from './AssetPane.vue'
import HomePane from './HomePane.vue'
import PendingModulePane from './PendingModulePane.vue'
import { resolveKnowledgeCenterUrl } from './knowledgeCenter'
import '../styles/open-platform.less'

type OpenPlatformTab =
  | 'home'
  | 'skills'
  | 'expert'
  | 'connectors'
  | 'apps'
  | 'hardware'
  | 'knowledge-center'

const TAB_STORAGE_KEY = 'jiaorong-open-platform-tab:v1'
const VALID_TABS: OpenPlatformTab[] = [
  'home',
  'skills',
  'expert',
  'connectors',
  'apps',
  'hardware',
  'knowledge-center'
]

const activeTab = ref<OpenPlatformTab>('home')
const knowledgeCenterUrl = ref('')
const api = getOpenPlatformClient()
const capabilities = createClientAppCapabilities()

const TABS: Array<{ key: OpenPlatformTab; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'skills', label: '技能' },
  { key: 'expert', label: '专家' },
  { key: 'connectors', label: '连接器 MCP' },
  { key: 'apps', label: '交融应用' },
  { key: 'hardware', label: '硬件（待开放）' },
  { key: 'knowledge-center', label: '知识中心' }
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
  if (tab === 'knowledge-center') syncKnowledgeCenterUrl()
})

onActivated(() => {
  // 从其它菜单保活回来：登录态可能已换新，仅在 token 变化时重载 iframe
  if (activeTab.value === 'knowledge-center') syncKnowledgeCenterUrl()
})

/**
 * 只在 URL 真正变化（首次进入或 token 换新）时赋值。
 * 重复赋同一个 src 会让浏览器整页重载 iframe，问答状态随之丢失。
 */
function syncKnowledgeCenterUrl(): void {
  const nextUrl = resolveKnowledgeCenterUrl()
  if (nextUrl === knowledgeCenterUrl.value) return
  knowledgeCenterUrl.value = nextUrl
}
</script>

<template>
  <section class="open-platform-page rounded-tl-xl">
    <header class="open-platform-page__topbar">
      <button class="open-platform-page__brand" type="button" @click="activeTab = 'home'">
        <span class="open-platform-page__brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
          </svg>
        </span>
        <span>交融超级智能体开放平台</span>
        <small>Open Platform</small>
      </button>
      <div class="open-platform-page__top-actions">
        <a
          class="open-platform-page__document-link"
          href="https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/started.html"
          target="_blank"
          rel="noopener"
        >
          开发文档
        </a>
        <!-- <button class="open-platform-page__download-button" type="button">下载客户端</button> -->
      </div>
    </header>
    <nav class="open-platform-page__tabs" aria-label="open platform tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="open-platform-page__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        type="button"
        :data-testid="`open-platform-tab-${tab.key}`"
        @click="activeTab = tab.key"
      >
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <main class="open-platform-page__content">
      <HomePane v-if="activeTab === 'home'" />
      <AssetPane v-else-if="activeTab === 'skills'" :api="api" asset-type="skill" />
      <PendingModulePane
        v-else-if="activeTab === 'expert'"
        title="专家"
        subtitle="面向行业场景预置的智能体，开箱即用"
        description="官方预置，暂不开放创建"
        icon='<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0113 0"/>'
      />
      <AssetPane v-else-if="activeTab === 'connectors'" :api="api" asset-type="connector" />
      <AppsPane v-else-if="activeTab === 'apps'" :api="api" :capabilities="capabilities" />
      <PendingModulePane
        v-else-if="activeTab === 'hardware'"
        title="硬件接入"
        subtitle="接入自研硬件设备，拓展智能体感知与执行"
        description="暂未发布"
        icon='<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>'
      />
      <!-- 知识中心常驻挂载，切走只隐藏不销毁，返回时保留 iframe 内部会话 -->
      <iframe
        v-if="knowledgeCenterUrl"
        v-show="activeTab === 'knowledge-center'"
        class="open-platform-page__iframe"
        :src="knowledgeCenterUrl"
        title="知识中心"
        allow="clipboard-read; clipboard-write"
        referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
      <div
        v-if="activeTab === 'knowledge-center' && !knowledgeCenterUrl"
        class="open-platform-page__placeholder"
      >
        <Icon icon="lucide:book-open" />
        <p>知识中心暂不可用，请先登录或稍后再试</p>
      </div>
    </main>
  </section>
</template>
