<template>
  <div
    data-testid="chat-message-user"
    :data-message-id="id"
    class="flex min-w-0 max-w-full flex-row-reverse group pt-5 pl-11 gap-2 user-message-item"
  >
    <div class="w-5 h-5 bg-muted rounded-md overflow-hidden">
      <div class="w-full h-full flex items-center justify-center text-muted-foreground">
        <Icon icon="lucide:user" class="w-4 h-4" />
      </div>
    </div>
    <div class="flex flex-col w-full space-y-1.5 items-end">
      <MessageInfo class="flex-row-reverse" :name="userName" :timestamp="timestamp" />
      <div v-if="skills.length" class="flex max-w-full flex-wrap justify-end gap-1.5 pr-1">
        <span
          v-for="skillName in skills"
          :key="skillName"
          class="inline-flex h-5 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 text-[11px] leading-none text-muted-foreground shadow-sm"
        >
          <Icon icon="lucide:sparkles" class="h-3 w-3 text-primary/70" />
          {{ skillLabel(skillName) }}
        </span>
      </div>
      <div
        class="text-sm bg-muted dark:bg-muted rounded-lg p-2 border flex flex-col gap-1.5"
        data-message-content="true"
      >
        <div v-if="files.length || knowledgeBaseSelections.length" class="flex flex-wrap gap-1.5">
          <KnowledgeBaseChips :items="knowledgeBaseSelections" />
          <FileAttachmentChip
            v-for="(file, index) in files"
            :key="`${file.path || file.name}-${index}`"
            :file-name="file.name"
            :mime-type="file.mimeType"
            :file-path="file.path"
            :thumbnail="file.thumbnail"
            :app-id="appId"
          />
        </div>
        <textarea
          v-if="isEditMode"
          ref="editTextarea"
          v-model="editedText"
          class="min-h-[2.5rem] min-w-[40vw] w-full resize-none overflow-y-auto bg-transparent text-sm break-all whitespace-pre-wrap outline-none"
          rows="1"
          @input="autoResize"
          @keydown.meta.enter.prevent="saveEdit"
          @keydown.ctrl.enter.prevent="saveEdit"
          @keydown.esc="cancelEdit"
        />
        <div v-else class="w-full min-w-0 text-sm break-all whitespace-pre-wrap">{{ text }}</div>
      </div>
      <MessageToolbar
        v-if="showToolbar || isEditMode"
        :is-assistant="false"
        :actions="toolbarActions"
        :is-edit-mode="isEditMode"
        :disabled="disabled"
        :copy-text="text"
        @retry="emit('retry')"
        @delete="emit('delete')"
        @edit="startEdit"
        @save="saveEdit"
        @cancel="cancelEdit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import FileAttachmentChip from '../../chat-kit/components/FileAttachmentChip.vue'
import MessageInfo from './MessageInfo.vue'
import MessageToolbar from './MessageToolbar.vue'
import KnowledgeBaseChips from '../../chat-kit/components/KnowledgeBaseChips.vue'
import type { JiaorongKbChip, JiaorongSlashItem } from '../../chat-kit/types'
import type { TranscriptFile } from '../lib/transcript'
import { displaySkillLabel } from '../lib/slashCommands'
import {
  resolveToolbarActions,
  toolbarHasVisibleActions,
  type JiaorongToolbarAction
} from '../lib/toolbar'

const props = withDefaults(
  defineProps<{
    id: string
    userName: string
    timestamp: number
    text: string
    files: TranscriptFile[]
    knowledgeBaseSelections?: JiaorongKbChip[]
    skills: string[]
    slashItems?: readonly JiaorongSlashItem[]
    appId?: string
    disabled?: boolean
    toolbar?: JiaorongToolbarAction[]
  }>(),
  {
    knowledgeBaseSelections: () => [],
    slashItems: () => [],
    appId: ''
  }
)

function skillLabel(skillName: string) {
  return displaySkillLabel(skillName, props.slashItems)
}

const toolbarActions = computed(() => resolveToolbarActions(props.toolbar))
const showToolbar = computed(() => toolbarHasVisibleActions(toolbarActions.value, 'user'))

const emit = defineEmits<{
  retry: []
  delete: []
  save: [text: string]
}>()

const isEditMode = ref(false)
const editedText = ref(props.text)
const editTextarea = useTemplateRef<HTMLTextAreaElement>('editTextarea')

watch(
  () => props.text,
  (value) => {
    if (!isEditMode.value) editedText.value = value
  }
)

function autoResize() {
  const el = editTextarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

async function startEdit() {
  editedText.value = props.text
  isEditMode.value = true
  await nextTick()
  autoResize()
  editTextarea.value?.focus()
}

function cancelEdit() {
  isEditMode.value = false
  editedText.value = props.text
}

function saveEdit() {
  const next = editedText.value.trim()
  if (!next) return
  isEditMode.value = false
  emit('save', next)
}
</script>
