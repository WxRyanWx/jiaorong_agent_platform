<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '../../types'
import { isUserCanceledError, localizeErrorText } from '../../localize'
import { collectContentBlocks, collectErrorBlocks } from '../lib/activity'
import { renderChatMarkdown } from '../lib/markdown'

const props = defineProps<{
  blocks: AssistantMessageBlock[]
  showErrors?: boolean
}>()

const contents = computed(() => collectContentBlocks(props.blocks))
const errors = computed(() => (props.showErrors === false ? [] : collectErrorBlocks(props.blocks)))
const expandedByKey = shallowRef<Record<string, boolean>>({})

function toggle(key: string) {
  expandedByKey.value = {
    ...expandedByKey.value,
    [key]: !expandedByKey.value[key]
  }
}

function errorKey(block: AssistantMessageBlock) {
  return block.id || `${block.timestamp}-error`
}

function isCanceled(block: AssistantMessageBlock) {
  return block.status === 'cancel' || isUserCanceledError(block.content)
}

function errorDetail(block: AssistantMessageBlock) {
  return localizeErrorText(block.content)
}
</script>

<template>
  <div class="flex w-full flex-col gap-1.5">
    <div
      v-for="block in contents"
      :key="block.id || `${block.timestamp}-content`"
      class="jr-chat-md markdown-renderer-root prose prose-sm w-full max-w-none break-words"
      v-html="renderChatMarkdown(block.content || '')"
    />
    <div v-for="block in errors" :key="errorKey(block)" class="cursor-default select-none">
      <div
        v-if="isCanceled(block)"
        class="text-muted-foreground flex flex-row items-center gap-2 py-2 text-sm"
      >
        <Icon icon="lucide:refresh-cw-off" class="h-3.5 w-3.5" />
        <span>{{ errorDetail(block) || '已停止生成' }}</span>
      </div>
      <template v-else>
        <button
          type="button"
          class="flex flex-row items-center gap-1 rounded-sm text-xs text-red-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          :aria-expanded="Boolean(expandedByKey[errorKey(block)])"
          @click="toggle(errorKey(block))"
        >
          请求失败，请稍后重试，或开新对话
          <Icon
            icon="lucide:chevron-right"
            class="h-3.5 w-3.5 transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
            :class="expandedByKey[errorKey(block)] ? 'rotate-90' : 'rotate-0'"
          />
        </button>
        <div
          class="grid overflow-hidden transition-[grid-template-rows,opacity] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]"
          :class="
            expandedByKey[errorKey(block)]
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          "
        >
          <div class="min-h-0 overflow-hidden">
            <div class="max-w-full text-xs leading-7 break-all whitespace-pre-wrap text-red-400">
              {{ errorDetail(block) }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
