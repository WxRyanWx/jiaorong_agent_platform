<!--
  计划面板：按步骤列出 Agent 计划，并显示完成进度。
  主要 props：items（计划步骤）、explanation（可选说明）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { AgentPlanItem } from '../model/host'

/** 计划面板入参：步骤列表与可选说明 */
const props = defineProps<{
  /** 计划步骤列表 */
  items: readonly AgentPlanItem[]
  /** 计划整体说明，没有则不展示 */
  explanation?: string
}>()

/** 已完成步骤数，用于进度文案 */
const completed = computed(() => props.items.filter((item) => item.status === 'completed').length)

/** 按步骤状态选图标：完成打勾、进行中转圈、其余空心圆 */
function statusIcon(status: AgentPlanItem['status']) {
  if (status === 'completed') return 'lucide:circle-check'
  if (status === 'in_progress') return 'lucide:loader-circle'
  return 'lucide:circle'
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-col p-4">
    <!-- 计划说明（可选） -->
    <p v-if="explanation" class="mb-3 text-xs text-muted-foreground">{{ explanation }}</p>
    <!-- 完成进度 -->
    <p class="mb-2 text-xs text-muted-foreground">{{ completed }}/{{ items.length }} 已完成</p>
    <!-- 步骤列表 -->
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
