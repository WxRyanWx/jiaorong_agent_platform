<script setup lang="ts">
import { Icon } from '@iconify/vue'
import KbFileTypeIcon from './KbFileTypeIcon.vue'
import KbIcon from './KbIcon.vue'
import { useKnowledgeBaseSelection } from './useKnowledgeBaseSelection'
import './KnowledgeBaseSelectionChips.less'

const props = defineProps<{
  sessionId?: string | null
}>()

const { items, removeByKey } = useKnowledgeBaseSelection(() => props.sessionId)
</script>

<template>
  <div
    v-if="items.length > 0"
    class="kb-selection-chips flex flex-wrap content-start gap-2 overflow-y-auto overscroll-contain px-4 pb-1 pt-2"
    data-testid="kb-selection-chips"
  >
    <div
      v-for="item in items"
      :key="item.key"
      class="kb-selection-chip"
      data-testid="kb-selection-chip"
    >
      <KbIcon
        v-if="item.kind === 'knowledgeBase'"
        class="kb-selection-chip-kb-icon"
        :icon="item.icon"
      />
      <KbFileTypeIcon
        v-else
        class="kb-selection-chip-file-icon"
        :file-name="item.name"
        :extension="item.extension"
        :is-directory="item.kind === 'folder'"
      />
      <span class="kb-selection-chip-name">{{ item.name }}</span>
      <button type="button" class="kb-selection-chip-remove" @click="removeByKey(item.key)">
        <Icon icon="lucide:x" class="kb-selection-chip-remove-icon" />
      </button>
    </div>
  </div>
</template>
