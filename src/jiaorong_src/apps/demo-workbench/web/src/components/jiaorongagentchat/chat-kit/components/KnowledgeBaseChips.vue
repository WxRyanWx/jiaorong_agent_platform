<!-- 消息气泡上的知识库芯片：按 kind 展示封面或文件类型图标。 -->
<script setup lang="ts">
import type { JiaorongKbChip } from '../types'
import KbFileTypeIcon from './KbFileTypeIcon.vue'
import KbIcon from './KbIcon.vue'

defineProps<{
  /** 本条消息关联的知识库 / 文件夹 / 文件 */
  items: JiaorongKbChip[]
}>()
</script>

<template>
  <!-- 单条芯片：知识库用封面，其余用文件类型图标 -->
  <div
    v-for="item in items"
    :key="item.key"
    class="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm"
    data-testid="kb-message-chip"
  >
    <KbIcon
      v-if="item.kind === 'knowledgeBase'"
      class="h-4 w-4 shrink-0 rounded-full object-cover"
      :icon="item.icon"
    />
    <KbFileTypeIcon
      v-else
      class="h-4 w-4 shrink-0 object-contain"
      :file-name="item.name"
      :extension="item.extension"
      :is-directory="item.kind === 'folder'"
    />
    <span class="max-w-[180px] truncate">{{ item.name }}</span>
  </div>
</template>
