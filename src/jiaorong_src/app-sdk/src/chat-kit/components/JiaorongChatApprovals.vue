<script setup lang="ts">
import type { AssistantMessageBlock } from '../../types'
import { Icon } from '@iconify/vue'

defineProps<{
  items: AssistantMessageBlock[]
}>()

const emit = defineEmits<{
  grant: [block: AssistantMessageBlock]
  deny: [block: AssistantMessageBlock]
}>()

function toolName(block: AssistantMessageBlock) {
  return block.tool_call?.name || block.extra?.toolName || '-'
}
</script>

<template>
  <div
    v-if="items.length"
    class="tool-interaction-overlay relative mb-3 flex min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-xl p-4 text-foreground"
  >
    <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Icon icon="lucide:shield-alert" class="h-4 w-4" />
      <span>需要审批</span>
    </div>
    <article v-for="block in items" :key="block.tool_call?.id || block.id">
      <p class="text-sm break-words whitespace-pre-wrap">该工具需要确认后才能继续</p>
      <div class="mt-3 space-y-2">
        <div class="rounded-md border bg-muted/50 px-3 py-2">
          <div class="text-[11px] tracking-wide text-muted-foreground uppercase">Tool</div>
          <div class="text-xs font-medium break-all">{{ toolName(block) }}</div>
        </div>
        <div v-if="block.tool_call?.params" class="rounded-md border bg-background/50 px-3 py-2">
          <div class="text-[11px] tracking-wide text-muted-foreground uppercase">Arguments</div>
          <pre class="mt-1 text-xs leading-5 break-words whitespace-pre-wrap">{{
            block.tool_call.params
          }}</pre>
        </div>
      </div>
      <div class="mt-4 flex shrink-0 gap-2">
        <button
          type="button"
          class="inline-flex h-8 flex-1 items-center justify-center rounded-md border bg-background px-3 text-xs shadow-xs"
          @click="emit('deny', block)"
        >
          拒绝
        </button>
        <button
          type="button"
          class="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs text-primary-foreground shadow-xs"
          @click="emit('grant', block)"
        >
          同意
        </button>
      </div>
    </article>
  </div>
</template>
