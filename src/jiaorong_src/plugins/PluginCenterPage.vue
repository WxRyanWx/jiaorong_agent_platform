<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PLUGIN_CENTER_NAV_WIDTH_CLASS } from './layout'
import { buildPluginCenterHideCss } from './hiddenItems'
import skillsIcon from '../assets/技能.svg?url'
import mcpIcon from '../assets/mcp.svg?url'
import connectorsIcon from '../assets/连接器.svg?url'

const { t } = useI18n()
const route = useRoute()

const navItems = [
  {
    key: 'skills',
    name: 'skills',
    titleKey: 'routes.pluginCenterSkills',
    iconSrc: skillsIcon,
    match: (name: string) => name === 'skills' || name === 'skills-detail'
  },
  {
    key: 'mcp',
    name: 'skills-mcp',
    titleKey: 'routes.pluginCenterMcp',
    iconSrc: mcpIcon,
    match: (name: string) => name === 'skills-mcp'
  },
  {
    key: 'connectors',
    name: 'skills-connectors',
    titleKey: 'routes.pluginCenterConnectors',
    iconSrc: connectorsIcon,
    match: (name: string) =>
      name === 'skills-connectors' ||
      name === 'skills-connector-detail' ||
      name === 'skills-connector-ocr'
  }
] as const

const activeKey = computed(() => {
  const name = String(route.name ?? '')
  return navItems.find((item) => item.match(name))?.key ?? 'skills'
})

const hideCss = buildPluginCenterHideCss()
let hideStyleEl: HTMLStyleElement | null = null

onMounted(() => {
  hideStyleEl = document.createElement('style')
  hideStyleEl.textContent = hideCss
  document.head.appendChild(hideStyleEl)
})

onUnmounted(() => {
  hideStyleEl?.remove()
  hideStyleEl = null
})
</script>

<template>
  <div class="plugin-center-page flex h-full min-h-0 w-full bg-window-background">
    <nav
      class="plugin-center-page__nav flex shrink-0 flex-col gap-1 px-2 pb-2 pt-1"
      :class="PLUGIN_CENTER_NAV_WIDTH_CLASS"
      :aria-label="t('routes.pluginCenterTitle')"
    >
      <div class="plugin-center-page__title px-2.5 pb-3 pt-3 text-[15px] font-medium">
        {{ t('routes.pluginCenterTitle') }}
      </div>
      <RouterLink
        v-for="item in navItems"
        :key="item.key"
        :to="{ name: item.name }"
        custom
        v-slot="{ navigate }"
      >
        <div
          class="plugin-center-page__nav-item no-drag flex min-h-[2.625rem] w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 text-left text-sm"
          :class="activeKey === item.key ? 'is-active' : ''"
          role="link"
          :aria-current="activeKey === item.key ? 'page' : undefined"
          :data-active="String(activeKey === item.key)"
          @click="navigate"
        >
          <img :src="item.iconSrc" alt="" class="size-[18px] shrink-0" />
          {{ t(item.titleKey) }}
        </div>
      </RouterLink>
    </nav>
    <div
      class="plugin-center-page__main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-t border-black/20 bg-background dark:border-white/10"
    >
      <RouterView />
    </div>
  </div>
</template>
