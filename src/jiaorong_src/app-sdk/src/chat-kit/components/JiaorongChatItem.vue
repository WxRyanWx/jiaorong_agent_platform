<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { JiaorongChatMessage } from '../types'
import { formatClock } from '../lib/questions'
import duihuaIcon from '../assets/duihua.png'
import JiaorongChatContent from './JiaorongChatContent.vue'
import JiaorongChatLoading from './JiaorongChatLoading.vue'
import JiaorongChatReasoning from './JiaorongChatReasoning.vue'
import KnowledgeBaseChips from './KnowledgeBaseChips.vue'

const props = defineProps<{
  item: JiaorongChatMessage
  agentName: string
  userName: string
  generating?: boolean
  liveTurn?: boolean
  showReasoning?: boolean
  showTools?: boolean
  showErrors?: boolean
  showLoading?: boolean
}>()

const isUser = computed(() => props.item.role === 'user')
const clock = computed(() => formatClock(props.item.createdAt))
const blocks = computed(() => props.item.blocks ?? [])
const hasAssistantBody = computed(() =>
  blocks.value.some(
    (block) =>
      block.type === 'content' ||
      block.type === 'error' ||
      block.type === 'reasoning_content' ||
      block.type === 'artifact-thinking' ||
      block.type === 'tool_call'
  )
)
</script>

<template>
  <div
    v-if="isUser"
    class="user-message-item group flex flex-row-reverse gap-2 pt-5 pl-11"
    data-testid="chat-message-user"
  >
    <div class="h-5 w-5 overflow-hidden rounded-md bg-muted">
      <div class="flex h-full w-full items-center justify-center text-muted-foreground">
        <Icon icon="lucide:user" class="h-4 w-4" />
      </div>
    </div>
    <div class="flex w-full flex-col items-end space-y-1.5">
      <div class="flex h-4 flex-row-reverse items-center gap-2">
        <span class="text-xs font-bold text-foreground">{{ userName }}</span>
        <span class="text-xs text-text-secondary-foreground">{{ clock }}</span>
      </div>
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-2 text-sm dark:bg-muted"
        data-message-content="true"
      >
        <div
          v-if="item.knowledgeBaseSelections?.length || item.attachmentNames?.length"
          class="flex flex-wrap gap-1.5"
        >
          <KnowledgeBaseChips :items="item.knowledgeBaseSelections ?? []" />
          <span
            v-for="name in item.attachmentNames"
            :key="name"
            class="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm"
          >
            <Icon icon="lucide:paperclip" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="max-w-[180px] truncate">{{ name }}</span>
          </span>
        </div>
        <div class="w-full min-w-0 text-sm break-all whitespace-pre-wrap">{{ item.text }}</div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="assistant-message-item group flex w-full flex-row justify-start gap-2 pt-5 pr-11 pl-4"
    data-testid="chat-message-assistant"
  >
    <div class="flex h-5 w-5 shrink-0 items-center justify-center">
      <img
        :src="duihuaIcon"
        alt="duihua"
        class="model-icon-img h-[18px] w-[18px] shrink-0 object-contain"
      />
    </div>
    <div class="flex min-w-0 w-full flex-col space-y-1.5">
      <div class="flex h-4 flex-row items-center gap-2">
        <span class="text-xs font-bold text-foreground">{{ agentName }}</span>
        <span class="text-xs text-text-secondary-foreground">{{ clock }}</span>
      </div>
      <div class="flex w-full flex-col gap-1.5">
        <JiaorongChatLoading v-if="showLoading && generating && !hasAssistantBody" />
        <JiaorongChatReasoning
          :blocks="blocks"
          :generating="generating"
          :live-turn="liveTurn"
          :show-reasoning="showReasoning"
          :show-tools="showTools"
        />
        <JiaorongChatContent :blocks="blocks" :show-errors="showErrors" />
      </div>
    </div>
  </div>
</template>
