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
  <template v-for="item in items" :key="item.key">
    <div class="kb-selection-chip" data-testid="kb-selection-chip">
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
  </template>
</template>
