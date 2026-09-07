<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import bundledLogo from '../assets/logo.png'
import { defaultAppLogoSrc } from '../lib/hostDialog'
import type { JiaorongChatProject } from '../types'
import JiaorongChatProjectPicker from './JiaorongChatProjectPicker.vue'

const props = defineProps<{
  projects: readonly JiaorongChatProject[]
  selectedPath?: string | null
  logoSrc?: string | null
  appId?: string
}>()

const emit = defineEmits<{
  'select-project': [path: string | null]
  'add-project': [project: JiaorongChatProject]
}>()

function resolveLogo() {
  return props.logoSrc?.trim() || defaultAppLogoSrc() || bundledLogo
}

const currentLogo = shallowRef(resolveLogo())

watch(
  () => props.logoSrc,
  () => {
    currentLogo.value = resolveLogo()
  }
)

const logoFailed = computed(() => currentLogo.value === bundledLogo)

function onLogoError() {
  if (currentLogo.value !== bundledLogo) currentLogo.value = bundledLogo
}
</script>

<template>
  <div data-testid="new-thread-page" class="flex h-full w-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-6">
      <div class="mb-4">
        <img
          :src="currentLogo"
          alt=""
          class="h-14 w-14 object-contain"
          :data-logo-fallback="String(logoFailed)"
          @error="onLogoError"
        />
      </div>
      <h1 class="mb-4 text-3xl font-semibold text-foreground">构建与探索</h1>
      <div class="mb-6">
        <JiaorongChatProjectPicker
          :projects="projects"
          :selected-path="selectedPath"
          :app-id="appId"
          @select="(path) => emit('select-project', path)"
          @add="(project) => emit('add-project', project)"
        />
      </div>
      <div class="flex w-full max-w-4xl justify-center">
        <slot />
      </div>
    </div>
  </div>
</template>
