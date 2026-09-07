<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { isUserCanceledError, localizeErrorText } from '../../localize'
import type { DisplayAssistantMessageBlock } from '../model/display'

const props = defineProps<{
  block: DisplayAssistantMessageBlock
}>()

const isExpanded = ref(false)
const canceled = computed(
  () => props.block.status === 'cancel' || isUserCanceledError(props.block.content)
)
const detailText = computed(() => localizeErrorText(props.block.content))
</script>

<template>
  <div v-if="canceled" class="text-muted-foreground text-sm flex flex-row gap-2 items-center py-2">
    <Icon icon="lucide:refresh-cw-off" />
    <span>{{ detailText || '已停止生成' }}</span>
  </div>
  <div v-else class="cursor-default select-none">
    <button
      type="button"
      class="flex flex-row items-center gap-1 rounded-sm text-xs text-red-500"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      请求失败，请稍后重试，或开新对话
      <Icon
        class="h-3.5 w-3.5 transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
        :class="isExpanded ? 'rotate-90' : 'rotate-0'"
        icon="lucide:chevron-right"
      />
    </button>
    <div
      class="grid overflow-hidden transition-[grid-template-rows,opacity] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]"
      :class="isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="max-w-full break-all whitespace-pre-wrap text-xs leading-7 text-red-400">
          {{ detailText }}
        </div>
      </div>
    </div>
  </div>
</template>
