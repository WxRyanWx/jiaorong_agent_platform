<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '../../types'

defineProps<{
  block: AssistantMessageBlock
}>()

const emit = defineEmits<{
  respond: [granted: boolean]
}>()
</script>

<template>
  <div class="flex min-h-0 w-full flex-col gap-3 p-4">
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon icon="lucide:shield" class="h-4 w-4" />
      <span>工具批准</span>
    </div>
    <p class="text-sm break-words">
      {{ block.tool_call?.name || block.content || '需要批准工具调用' }}
    </p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        @click="emit('respond', true)"
      >
        允许
      </button>
      <button
        type="button"
        class="rounded-md border px-3 py-1.5 text-xs"
        @click="emit('respond', false)"
      >
        拒绝
      </button>
    </div>
  </div>
</template>
