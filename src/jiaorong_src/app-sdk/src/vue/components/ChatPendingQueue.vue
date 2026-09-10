<script setup lang="ts">
import { Icon } from '@iconify/vue'

export type ChatQueuedTurn = {
  id: string
  text: string
}

defineProps<{
  items: ChatQueuedTurn[]
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()
</script>

<template>
  <div
    v-if="items.length"
    class="w-full max-w-4xl rounded-xl border border-border/70 bg-card/55 px-2.5 py-2"
    data-testid="pending-rail"
  >
    <div class="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>排队 {{ items.length }}</span>
    </div>
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
