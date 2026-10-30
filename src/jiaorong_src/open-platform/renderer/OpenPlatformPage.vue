<script setup lang="ts">
defineOptions({ name: 'OpenPlatformPage' })

import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { getOpenPlatformClient } from '@jiaorong/api/openPlatform'
import { createClientAppCapabilities } from './clientAppCapabilities'
import AppsPane from './AppsPane.vue'
import AssetPane from './AssetPane.vue'
import HomePane from './HomePane.vue'
import PendingModulePane from './PendingModulePane.vue'
import { fetchBuildSignature, resolveKnowledgeCenterUrl } from './knowledgeCenter'
import {
  hideKnowledgeCenterFrame,
  releaseKnowledgeCenterFrame,
  setKnowledgeCenterFrameUrl,
  showKnowledgeCenterFrame
} from './knowledgeCenterFrame'
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
  'hardware'
  // 问答中心下周上线：先不接受本地残留的 knowledge-center，避免停在隐藏页签
  // 'knowledge-center'
]

const activeTab = ref<OpenPlatformTab>('home')
const knowledgeCenterUrl = ref('')
/** 入口 HTML 的缓存击穿 key：进程启动和检测到线上换版时更新，切菜单不变。 */
const knowledgeCenterReloadKey = ref(Date.now().toString(36))
/** 当前 iframe 里实际生效的构建指纹，用于判断线上是否已换版。 */
const knowledgeCenterBuildSignature = ref<string | null>(null)
let lastBuildProbeAt = 0
let isBuildProbePending = false
const api = getOpenPlatformClient()
const capabilities = createClientAppCapabilities()

const BUILD_PROBE_INTERVAL_MS = 30_000

const TABS: Array<{ key: OpenPlatformTab; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'skills', label: '技能' },
  { key: 'expert', label: '专家' },
  { key: 'connectors', label: '连接器 MCP' },
  { key: 'apps', label: '交融应用' },
  { key: 'hardware', label: '硬件（待开放）' }
  // 问答中心下周上线，本次生产版本先不放入口，恢复时解开这一行即可
  // { key: 'knowledge-center', label: '问答中心' }
]

function readStoredTab(): OpenPlatformTab {
  const value = localStorage.getItem(TAB_STORAGE_KEY)
  return VALID_TABS.includes(value as OpenPlatformTab) ? (value as OpenPlatformTab) : 'home'
}

onMounted(() => {
  // 页面重建时清掉上一个实例残留的问答中心 iframe，避免带着旧 token 继续跑
  releaseKnowledgeCenterFrame()
  activeTab.value = readStoredTab()
  window.addEventListener('focus', handleWindowActivity)
  document.addEventListener('visibilitychange', handleWindowActivity)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowActivity)
  document.removeEventListener('visibilitychange', handleWindowActivity)
  releaseKnowledgeCenterFrame()
})

watch(activeTab, (tab) => {
  localStorage.setItem(TAB_STORAGE_KEY, tab)
  if (tab === 'knowledge-center') {
    ensureKnowledgeCenterReady()
    return
  }
  hideKnowledgeCenterFrame()
})

onActivated(() => {
  // 从其它菜单保活回来：登录态可能已换新，仅在 token 变化时重载 iframe
  if (activeTab.value === 'knowledge-center') ensureKnowledgeCenterReady()
})

onDeactivated(() => {
  // 切到其它一级菜单：只隐藏，常驻 iframe 不销毁，问答状态保留
  hideKnowledgeCenterFrame()
})

/**
 * 同步 iframe 地址。本地 ref 只给占位提示用，常驻 iframe 以 frame 状态为准，
 * 所以必须无条件写一次：token 被清空时才能把旧 iframe 一并收掉。
 */
function syncKnowledgeCenterUrl(): void {
  const nextUrl = resolveKnowledgeCenterUrl(knowledgeCenterReloadKey.value)
  knowledgeCenterUrl.value = nextUrl
  setKnowledgeCenterFrameUrl(nextUrl)
}

/**
 * 进入问答中心时先保证 iframe 已挂载，再按需记录/校验线上构建指纹。
 */
function ensureKnowledgeCenterReady(): void {
  syncKnowledgeCenterUrl()
  if (!knowledgeCenterUrl.value) return

  showKnowledgeCenterFrame()
  void refreshKnowledgeCenterBuild(!knowledgeCenterBuildSignature.value)
}

/**
 * 拉一次线上入口指纹：第一个指纹只做基线，之后发现变化才换 key 重载。
 * 同一时刻只允许一个探测，窗口频繁获焦不会放大请求。
 * @param immediate 首次进入时立即探测，忽略节流
 */
async function refreshKnowledgeCenterBuild(immediate: boolean): Promise<void> {
  if (isBuildProbePending) return
  const now = Date.now()
  if (!immediate && now - lastBuildProbeAt < BUILD_PROBE_INTERVAL_MS) return

  isBuildProbePending = true
  lastBuildProbeAt = now
  try {
    const signature = await fetchBuildSignature()
    if (!signature) return

    const previousSignature = knowledgeCenterBuildSignature.value
    knowledgeCenterBuildSignature.value = signature
    if (!previousSignature || previousSignature === signature) return

    knowledgeCenterReloadKey.value = Date.now().toString(36)
    syncKnowledgeCenterUrl()
  } finally {
    isBuildProbePending = false
  }
}

/** 窗口重新获得焦点/从隐藏恢复时校验一次，避免停留在旧版问答中心。 */
function handleWindowActivity(): void {
  if (document.visibilityState === 'hidden') return
  if (!knowledgeCenterUrl.value) return
  void refreshKnowledgeCenterBuild(false)
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

    <main class="open-platform-page__content" data-knowledge-center-anchor>
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
      <!-- 问答中心 iframe 由常驻宿主承载，切一级菜单不会重建，见 KnowledgeCenterFrameHost -->
      <div
        v-if="activeTab === 'knowledge-center' && !knowledgeCenterUrl"
        class="open-platform-page__placeholder"
      >
        <Icon icon="lucide:book-open" />
        <p>问答中心暂不可用，请先登录或稍后再试</p>
      </div>
    </main>
  </section>
</template>
