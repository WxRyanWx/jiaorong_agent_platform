<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'
import type { JiaorongChatPermissionMode } from '../types'

const props = defineProps<{
  permissionMode?: JiaorongChatPermissionMode
  collaboration?: boolean
}>()

const emit = defineEmits<{
  'update:permissionMode': [mode: JiaorongChatPermissionMode]
  'update:collaboration': [enabled: boolean]
}>()

const permissionOpen = ref(false)
const collabOpen = ref(false)
const collabRoot = shallowRef<HTMLElement | null>(null)
const modes: Array<{
  value: JiaorongChatPermissionMode
  label: string
  icon: string
  className: string
}> = [
  {
    value: 'default',
    label: '默认权限',
    icon: 'lucide:shield',
    className: 'text-muted-foreground'
  },
  {
    value: 'auto_approve',
    label: '助手代审',
    icon: 'lucide:shield-check',
    className: 'text-emerald-500'
  },
  {
    value: 'full_access',
    label: '完全访问',
    icon: 'lucide:shield-alert',
    className: 'text-orange-500'
  }
]
const current = computed(
  () => modes.find((item) => item.value === (props.permissionMode || 'full_access')) ?? modes[2]
)

function selectMode(mode: JiaorongChatPermissionMode) {
  emit('update:permissionMode', mode)
  permissionOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (collabRoot.value && target && !collabRoot.value.contains(target)) {
    collabOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <div class="flex w-full items-center justify-between px-1 py-2">
    <div ref="collabRoot" class="relative flex min-w-0 items-center gap-1">
      <button
        type="button"
        data-testid="orchestration-control"
        class="dc-blur-panel inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs"
        :class="
          collaboration
            ? 'bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/30 ring-inset'
            : 'text-muted-foreground hover:text-foreground'
        "
        :aria-pressed="collaboration"
        @click="collabOpen = !collabOpen"
      >
        <Icon v-if="collaboration" icon="lucide:git-fork" class="h-3.5 w-3.5" />
        <span>主动协作</span>
        <Icon icon="lucide:chevron-down" class="h-3 w-3" />
      </button>
      <div
        v-if="collabOpen"
        class="absolute bottom-full left-0 z-20 mb-1 w-[19rem] overflow-hidden rounded-md border border-border bg-background shadow-md"
      >
        <div class="border-b px-3 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <Icon icon="lucide:git-fork" class="h-4 w-4 shrink-0" />
              <span class="text-sm font-medium">主动协作</span>
            </div>
            <button
              type="button"
              data-testid="proactive-collaboration-toggle"
              role="switch"
              class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
              :class="collaboration ? 'bg-violet-500' : 'bg-muted'"
              :aria-checked="collaboration"
              @click="emit('update:collaboration', !collaboration)"
            >
              <span
                class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                :class="collaboration ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            允许主 Agent 在独立或并行工作明显有帮助时主动委派；可能消耗更多时间、Token 和系统资源。
          </p>
        </div>
      </div>
    </div>
    <div class="relative">
      <button
        type="button"
        class="dc-blur-panel inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs hover:text-orange-600"
        :class="current.className"
        @click="permissionOpen = !permissionOpen"
      >
        <Icon :icon="current.icon" class="h-3.5 w-3.5" />
        <span>{{ current.label }}</span>
        <Icon icon="lucide:chevron-down" class="h-3 w-3" />
      </button>
      <div
        v-if="permissionOpen"
        class="absolute right-0 bottom-full z-20 mb-1 min-w-48 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md"
      >
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
          @click="selectMode(mode.value)"
        >
          <Icon :icon="mode.icon" class="h-3.5 w-3.5 shrink-0" :class="mode.className" />
          <span class="flex-1">{{ mode.label }}</span>
          <Icon
            v-if="(permissionMode || 'full_access') === mode.value"
            icon="lucide:check"
            class="h-3.5 w-3.5"
          />
        </button>
      </div>
    </div>
  </div>
</template>
