<template>
  <div
    data-testid="chat-message-assistant"
    class="flex flex-row pl-4 pt-5 pr-11 group gap-2 w-full min-w-0 max-w-full justify-start assistant-message-item"
  >
    <div class="shrink-0 w-5 h-5 flex items-center justify-center">
      <img :src="duihuaIcon" alt="交融对话" class="model-icon-img h-[18px] w-[18px] shrink-0 object-contain" />
    </div>
    <div class="flex min-w-0 flex-col w-full space-y-1.5">
      <MessageInfo :name="agentName" :timestamp="timestamp" />
      <div class="flex flex-col w-full gap-1.5" data-message-content="true">
        <Icon
          v-if="generating && !hasBody"
          icon="lucide:loader-circle"
          class="size-3 animate-spin text-muted-foreground"
        />
        <template v-for="item in renderItems" :key="item.key">
          <MessageBlockActivityGroup
            v-if="item.kind === 'activity-group'"
            :blocks="item.blocks"
            :usage="usage"
            :duration-ms="item.durationMs"
            :reasoning-count="item.reasoningCount"
            :tool-call-count="item.toolCallCount"
            :permission-status-by-tool-call-id="permissionStatusByToolCallId"
          />
          <MessageBlockContent v-else-if="item.block.type === 'content'" :block="item.block" />
          <MessageBlockThink
            v-else-if="
              (item.block.type === 'reasoning_content' || item.block.type === 'artifact-thinking') &&
              item.block.content
            "
            :block="item.block"
            :usage="usage"
          />
          <MessageBlockToolCall
            v-else-if="item.block.type === 'tool_call'"
            :block="item.block"
            :permission-status="
              item.block.tool_call?.id
                ? permissionStatusByToolCallId[item.block.tool_call.id]
                : undefined
            "
          />
          <MessageBlockError v-else-if="item.block.type === 'error'" :block="item.block" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import duihuaIcon from '../assets/duihua.png'
import {
  buildResolvedPermissionStatusByToolCallId,
  EMPTY_USAGE,
  isInternalAssistantToolCallBlock,
  type DisplayAssistantMessageBlock
} from '../model/display'
import { buildAssistantRenderItems } from '../model/activityGroups'
import MessageInfo from './MessageInfo.vue'
import MessageBlockActivityGroup from './MessageBlockActivityGroup.vue'
import MessageBlockContent from './MessageBlockContent.vue'
import MessageBlockThink from './MessageBlockThink.vue'
import MessageBlockToolCall from './MessageBlockToolCall.vue'
import MessageBlockError from './MessageBlockError.vue'

const props = defineProps<{
  id: string
  agentName: string
  timestamp: number
  updatedAt: number
  blocks: DisplayAssistantMessageBlock[]
  generating?: boolean
  streaming?: boolean
  status?: string
}>()

const usage = computed(() => {
  const reasoning = props.blocks.find(
    (block) => block.type === 'reasoning_content' || block.type === 'artifact-thinking'
  )
  const range = reasoning?.reasoning_time
  if (range && typeof range === 'object' && 'start' in range) {
    return { reasoning_start_time: range.start, reasoning_end_time: range.end }
  }
  return EMPTY_USAGE
})

const permissionStatusByToolCallId = computed(() =>
  buildResolvedPermissionStatusByToolCallId(props.blocks)
)

const visibleBlocks = computed(() =>
  props.blocks.filter((block) => {
    const status = block.type === 'action' ? block.status : null
    const toolCallId = block.tool_call?.id
    return !(
      (status === 'granted' || status === 'denied') &&
      toolCallId &&
      permissionStatusByToolCallId.value[toolCallId]
    )
  })
)

const renderItems = computed(() =>
  buildAssistantRenderItems({
    blocks: visibleBlocks.value,
    messageId: props.id,
    messageUpdatedAt: props.updatedAt,
    shouldGroup: !props.streaming && props.status !== 'pending',
    isInternalToolCall: isInternalAssistantToolCallBlock
  })
)

const hasBody = computed(() =>
  visibleBlocks.value.some(
    (block) =>
      block.type === 'content' ||
      block.type === 'error' ||
      block.type === 'reasoning_content' ||
      block.type === 'artifact-thinking' ||
      block.type === 'tool_call'
  )
)
</script>
