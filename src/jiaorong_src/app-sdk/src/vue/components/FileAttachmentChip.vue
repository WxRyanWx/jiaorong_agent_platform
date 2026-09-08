<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { resolveKbFileIconSrc } from '../../chat-kit/lib/resolveKbFileIcon'

const props = defineProps<{
  fileName?: string | null
  removable?: boolean
}>()

const emit = defineEmits<{
  remove: []
}>()

const src = computed(() => resolveKbFileIconSrc(props.fileName || undefined))
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm"
  >
    <img class="h-4 w-4 shrink-0 object-contain" :src="src" :alt="fileName || ''" />
    <span class="max-w-[180px] truncate">{{ fileName }}</span>
    <button v-if="removable" type="button" @click="emit('remove')">
      <Icon icon="lucide:x" class="h-3 w-3" />
    </button>
  </span>
</template>
