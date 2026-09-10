<!--
  助手消息行：按块渲染正文、思考、工具调用、错误与活动分组，并提供工具栏。
  主要 props：id、agentName、timestamp、updatedAt、blocks、generating、streaming、
  status、threadGenerating、disabled、toolbar。
-->
<template>
  <div
    ref="rootRef"
    data-testid="chat-message-assistant"
    :data-message-id="id"
    class="flex flex-row pl-4 pt-5 pr-11 group gap-2 w-full min-w-0 max-w-full justify-start assistant-message-item"
  >
    <!-- 助手头像 -->
    <div class="shrink-0 w-5 h-5 flex items-center justify-center">
      <img
        :src="duihuaIcon"
        alt="交融对话"
        class="model-icon-img h-[18px] w-[18px] shrink-0 object-contain"
      />
    </div>
    <div class="flex min-w-0 flex-col w-full space-y-1.5">
      <MessageInfo :name="agentName" :timestamp="timestamp" />
      <!-- 消息体：生成中无内容时转圈，否则按 renderItems 分发 -->
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
              (item.block.type === 'reasoning_content' ||
                item.block.type === 'artifact-thinking') &&
              item.block.content
            "
            :block="item.block"
            :usage="usage"
            :live="isLive"
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
      <!-- 截图过程中隐藏工具栏，避免按钮进图 -->
      <MessageToolbar
        v-if="showToolbar && !capturing"
        is-assistant
        :actions="toolbarActions"
        :loading="streaming || (status === 'pending' && (generating || threadGenerating))"
        :generating="threadGenerating"
        :disabled="disabled"
        :capturing="capturing"
        :image-copied="imageCopied"
        :copy-text="copyText"
        @retry="emit('retry')"
        @delete="emit('delete')"
        @fork="emit('fork')"
        @copy-image="onCopyImage(false)"
        @copy-image-from-top="onCopyImage(true)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { Icon } from '@iconify/vue'
import { collectAssistantText } from 'jiaorong-app-sdk'
import { copyElementAsPng } from '../lib/copyAsImage'
import duihuaIcon from '../assets/duihua.png'
import {
  buildResolvedPermissionStatusByToolCallId,
  EMPTY_USAGE,
  isInternalAssistantToolCallBlock,
  type DisplayAssistantMessageBlock
} from '../model/display'
import { buildAssistantRenderItems } from '../model/activityGroups'
import MessageInfo from './MessageInfo.vue'
import MessageToolbar from './MessageToolbar.vue'
import MessageBlockActivityGroup from './MessageBlockActivityGroup.vue'
import MessageBlockContent from './MessageBlockContent.vue'
import MessageBlockThink from './MessageBlockThink.vue'
import MessageBlockToolCall from './MessageBlockToolCall.vue'
import MessageBlockError from './MessageBlockError.vue'
import {
  resolveToolbarActions,
  toolbarHasVisibleActions,
  type JiaorongToolbarAction
} from '../lib/toolbar'

/** 助手消息行入参，供分块渲染与工具栏使用 */
const props = defineProps<{
  /** 消息 id */
  id: string
  /** 助手显示名 */
  agentName: string
  /** 创建时间戳 */
  timestamp: number
  /** 最近更新时间，分组 key 用 */
  updatedAt: number
  /** 助手消息块列表 */
  blocks: DisplayAssistantMessageBlock[]
  /** 本条是否仍在生成 */
  generating?: boolean
  /** 是否正在流式输出 */
  streaming?: boolean
  /** 消息状态，如 pending */
  status?: string
  /** 整条线程是否仍在生成（影响重试 / 分叉禁用） */
  threadGenerating?: boolean
  /** 禁用工具栏写操作 */
  disabled?: boolean
  /** 覆盖默认工具栏动作 */
  toolbar?: JiaorongToolbarAction[]
}>()

/** 解析后的工具栏动作 */
const toolbarActions = computed(() => resolveToolbarActions(props.toolbar))
/** 助手侧是否有可见工具栏按钮 */
const showToolbar = computed(() => toolbarHasVisibleActions(toolbarActions.value, 'assistant'))

/** 向父级抛出的助手消息动作，字段含义见下方 */
const emit = defineEmits<{
  /** 重试本条助手消息 */
  retry: []
  /** 删除本条助手消息 */
  delete: []
  /** 从本条分叉新会话 */
  fork: []
}>()

/** 本条消息根节点，截图时用来找内容区或整列列表 */
const rootRef = useTemplateRef<HTMLElement>('rootRef')
/** 正在截图，期间隐藏工具栏 */
const capturing = ref(false)
/** 截图复制成功，供工具栏闪提示 */
const imageCopied = ref(false)
/** 纯文本复制内容：收集全部助手正文 */
const copyText = computed(() => collectAssistantText(props.blocks))

/** 从思考块或空 usage 取出推理起止时间 */
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

/** 按 tool_call.id 汇总批准结果，供工具块徽标使用 */
const permissionStatusByToolCallId = computed(() =>
  buildResolvedPermissionStatusByToolCallId(props.blocks)
)

/** 已有批准结果的 action 块不再单独渲染，避免重复 */
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

/** 流式中不分组，便于逐块实时露出 */
const isLive = computed(() => Boolean(props.streaming))

/** 把可见块编成活动分组或单块渲染项 */
const renderItems = computed(() =>
  buildAssistantRenderItems({
    blocks: visibleBlocks.value,
    messageId: props.id,
    messageUpdatedAt: props.updatedAt,
    shouldGroup: !isLive.value,
    isInternalToolCall: isInternalAssistantToolCallBlock
  })
)

/** 是否已有可展示正文，用于决定要不要转圈占位 */
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

/** 复制为图片。fromTop 为 true 截整列消息，否则只截本条内容区 */
async function onCopyImage(fromTop: boolean) {
  const root = rootRef.value
  const target = fromTop
    ? root?.closest('[data-testid="chat-message-list"]')
    : root?.querySelector('[data-message-content="true"]')
  if (!(target instanceof HTMLElement)) return
  imageCopied.value = false
  capturing.value = true
  try {
    await nextTick()
    await copyElementAsPng(target)
    imageCopied.value = true
  } catch (error) {
    console.error('[jiaorong] copy image failed', error)
  } finally {
    capturing.value = false
  }
}
</script>
