<!--
  待发送队列：展示已排队、尚未发出的用户回合，支持逐条移除。
  主要 props：items（排队回合列表，含 id 与 text）。
-->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

/** 队列中的一条待发送回合 */
export type ChatQueuedTurn = {
  id: string
  text: string
}

/** 待发送队列入参：当前排队回合列表 */
defineProps<{
  /** 当前排队中的回合 */
  items: ChatQueuedTurn[]
}>()

/** 向父级抛出的队列操作，字段含义见下方 */
const emit = defineEmits<{
  /** 按 id 移除一条排队回合 */
  remove: [id: string]
}>()
</script>

<template>
  <!-- 无排队项时不渲染 -->
  <div
    v-if="items.length"
    class="w-full max-w-4xl rounded-xl border border-border/70 bg-card/55 px-2.5 py-2"
    data-testid="pending-rail"
  >
    <!-- 队列标题与条数 -->
    <div class="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>排队 {{ items.length }}</span>
    </div>
    <!-- 排队条目列表 -->
    <div class="space-y-1">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2 rounded-lg border border-border/50 bg-background/65 px-2 py-1"
      >
        <span class="min-w-0 flex-1 truncate text-[13px]">{{ item.text || '（附件）' }}</span>
        <button
          type="button"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          title="移除"
          @click="emit('remove', item.id)"
        >
          <Icon icon="lucide:x" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
