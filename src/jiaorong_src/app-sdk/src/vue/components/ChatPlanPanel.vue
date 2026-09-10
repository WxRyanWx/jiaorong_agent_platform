<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { AgentPlanItem } from '../../types'

const props = defineProps<{
  items: readonly AgentPlanItem[]
  explanation?: string
}>()

const completed = computed(() => props.items.filter((item) => item.status === 'completed').length)

function statusIcon(status: AgentPlanItem['status']) {
  if (status === 'completed') return 'lucide:circle-check'
  if (status === 'in_progress') return 'lucide:loader-circle'
  return 'lucide:circle'
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-col p-4">
    <p v-if="explanation" class="mb-3 text-xs text-muted-foreground">{{ explanation }}</p>
    <p class="mb-2 text-xs text-muted-foreground">{{ completed }}/{{ items.length }} 已完成</p>
    <ul class="flex flex-col gap-2">
      <li
        v-for="(item, index) in items"
        :key="`${index}-${item.step}`"
        class="flex items-start gap-2 text-sm"
      >
        <Icon
          :icon="statusIcon(item.status)"
          class="mt-0.5 h-4 w-4 shrink-0"
          :class="item.status === 'in_progress' ? 'animate-spin text-primary' : ''"
        />
        <span class="min-w-0 flex-1 break-words">{{ item.step }}</span>
      </li>
    </ul>
  </div>
</template>
