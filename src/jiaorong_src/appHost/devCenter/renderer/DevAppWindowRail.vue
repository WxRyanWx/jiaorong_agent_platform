<script setup lang="ts">
// 组件名固定，供调试面板识别
defineOptions({ name: 'JiaorongDevAppRail' })

import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import type { JiaorongDevCenterItem } from '@jiaorong/appHost/types'
import './DevAppWindowRail.less'

const { t } = useI18n()
const route = useRoute()
/** 当前窗口打开的唯一应用；null 表示还没拉到。 */
const app = ref<JiaorongDevCenterItem | null>(null)

/**
 * 按路由 id 拉图标与显示名；侧边栏由外壳直接渲染，首帧路由还没 resolve，必须跟参数响应式取。
 * @param appId 路由携带的应用 id
 */
async function loadRailApp(appId: string): Promise<void> {
  if (!appId) return
  try {
    /** 开发者中心列表含本地登记的图标与显示名。 */
    const items = (await window.jiaorongApps?.listDevCenter()) ?? []
    app.value = items.find((item) => item.id === appId) ?? null
  } catch (error) {
    console.warn('[jiaorong-dev-app] failed to load rail app', appId, error)
  }
}

watch(
  () => (typeof route.params.appId === 'string' ? route.params.appId : ''),
  (appId) => {
    void loadRailApp(appId)
  },
  { immediate: true }
)
</script>

<template>
  <div class="jiaorong-dev-app-rail">
    <!-- 所有 agent：与主窗口侧边栏顶部对应的纯 UI 占位，不可点击 -->
    <div class="jiaorong-dev-app-rail__item" :title="t('chat.sidebar.allAgents')">
      <Icon icon="lucide:layers" class="jiaorong-dev-app-rail__glyph" />
    </div>
    <div class="jiaorong-dev-app-rail__sep"></div>
    <!-- 当前打开的应用：恒定选中态，仅展示 -->
    <div class="jiaorong-dev-app-rail__item is-active" :title="app?.name ?? ''">
      <img v-if="app?.iconSrc" :src="app.iconSrc" alt="" class="jiaorong-dev-app-rail__icon" />
      <Icon v-else icon="lucide:layout-grid" class="jiaorong-dev-app-rail__glyph" />
    </div>
  </div>
</template>
