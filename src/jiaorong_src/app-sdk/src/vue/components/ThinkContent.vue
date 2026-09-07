<template>
  <div
    class="text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50 flex flex-col gap-[6px]"
  >
    <div class="inline-flex items-center gap-[10px] select-none self-start" @click="$emit('toggle')">
      <span class="whitespace-nowrap">{{ label }}</span>
      <Icon
        v-if="thinking && !expanded"
        icon="lucide:ellipsis"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
      />
      <Icon
        v-else-if="expanded"
        icon="lucide:chevron-down"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
      />
      <Icon
        v-else
        icon="lucide:chevron-right"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
      />
    </div>
    <div v-if="expanded && content" class="think-prose w-full max-w-full whitespace-pre-wrap">
      {{ content }}
    </div>
    <Icon
      v-if="thinking && expanded"
      icon="lucide:ellipsis"
      class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
    />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  label: string
  expanded: boolean
  thinking: boolean
  content?: string
}>()

defineEmits<{ toggle: [] }>()
</script>

<style scoped>
.think-prose {
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0;
}
</style>
