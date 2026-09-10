<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import knowledgeIcon from '../assets/knowledge.png'
import { pickHostFiles } from '../lib/hostDialog'
import { browserFilesToPending, type PendingAttachment } from '../lib/files'
import { hydratePendingAttachments } from '../lib/filePreview'
import { filterSlashItems, readSlashQuery, replaceSlashToken } from '../lib/slash'
import type { JiaorongKbSelection, JiaorongSlashItem } from '../types'
import JiaorongChatSlashMenu from './JiaorongChatSlashMenu.vue'
import FileAttachmentChip from './FileAttachmentChip.vue'
import KbFileTypeIcon from './KbFileTypeIcon.vue'
import KbIcon from './KbIcon.vue'
import './KnowledgeBaseSelectionChips.less'

const draft = defineModel<string>({ default: '' })
const activeSkills = defineModel<JiaorongSlashItem[]>('activeSkills', { default: () => [] })

const props = withDefaults(
  defineProps<{
    sending?: boolean
    generating?: boolean
    disabled?: boolean
    agentName?: string
    attachments?: boolean
    knowledgeBase?: boolean
    stop?: boolean
    slash?: boolean
    files?: PendingAttachment[]
    knowledgeBaseSelections?: JiaorongKbSelection[]
    slashItems?: readonly JiaorongSlashItem[]
    appId?: string
  }>(),
  {
    sending: false,
    generating: false,
    disabled: false,
    agentName: '交融对话',
    attachments: true,
    knowledgeBase: true,
    stop: true,
    slash: true,
    files: () => [],
    knowledgeBaseSelections: () => [],
    slashItems: () => [],
    appId: ''
  }
)

const emit = defineEmits<{
  send: []
  stop: []
  attach: [files: PendingAttachment[]]
  'open-knowledge-base': []
  'remove-file': [index: number]
  'remove-kb': [key: string]
}>()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
const slashMenu = useTemplateRef<{ onKeyDown: (event: KeyboardEvent) => boolean | 'close' }>(
  'slashMenu'
)
const cursor = shallowRef(0)
const slashDismissed = shallowRef(false)
const slashMenuStyle = ref({ left: '0px', bottom: '0px' })
const placeholder = computed(() => `向 ${props.agentName} 发送消息，@ 可引用文件，/ 可使用命令`)
const hasInlineChips = computed(() => props.files.length > 0 || activeSkills.value.length > 0)
const editorPlaceholder = computed(() => (hasInlineChips.value ? '' : placeholder.value))
const canSend = computed(() => !props.disabled && !props.sending && Boolean(draft.value.trim()))
const buttonMode = computed(() => (props.generating && !draft.value.trim() ? 'stop' : 'send'))
const slashRange = computed(() => (props.slash ? readSlashQuery(draft.value, cursor.value) : null))
const slashOpen = computed(
  () => Boolean(slashRange.value) && !slashDismissed.value && props.slashItems.length > 0
)
const filteredSlashItems = computed(() =>
  slashRange.value ? filterSlashItems(props.slashItems, slashRange.value.query) : []
)

watch(
  () => slashRange.value?.query,
  () => {
    slashDismissed.value = false
  }
)

function syncCursor() {
  cursor.value = textarea.value?.selectionStart ?? draft.value.length
}

function updateSlashPosition() {
  const rect = textarea.value?.getBoundingClientRect()
  if (!rect) return
  slashMenuStyle.value = {
    left: `${Math.max(8, rect.left)}px`,
    bottom: `${Math.max(8, window.innerHeight - rect.top + 8)}px`
  }
}

function closeSlash() {
  slashDismissed.value = true
}

function onSelectSlash(item: JiaorongSlashItem) {
  const range = slashRange.value
  if (!range) return
  const insert =
    item.category === 'skill' && item.skillName ? '' : item.insertText || `@${item.label} `
  if (item.category === 'skill' && item.skillName) {
    if (!activeSkills.value.some((skill) => skill.skillName === item.skillName)) {
      activeSkills.value = [...activeSkills.value, item]
    }
  }
  draft.value = replaceSlashToken(draft.value, range, insert)
  const nextCursor = range.start + insert.length
  slashDismissed.value = true
  requestAnimationFrame(() => {
    textarea.value?.setSelectionRange(nextCursor, nextCursor)
    cursor.value = nextCursor
  })
}

function removeSkill(skillName: string) {
  activeSkills.value = activeSkills.value.filter((item) => item.skillName !== skillName)
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (slashOpen.value) {
    const handled = slashMenu.value?.onKeyDown(event)
    if (handled === 'close') {
      closeSlash()
      return
    }
    if (handled) return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (buttonMode.value === 'stop') {
      emit('stop')
      return
    }
    if (canSend.value) emit('send')
  }
}

async function pickFiles() {
  const picked = await pickHostFiles(props.appId)
  if (picked) {
    if (picked.length) {
      emit('attach', await hydratePendingAttachments(picked, props.appId))
    }
    return
  }
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const next = Array.from(input.files ?? [])
  input.value = ''
  if (next.length) {
    emit('attach', await hydratePendingAttachments(browserFilesToPending(next), props.appId))
  }
}

watch(slashOpen, (open) => {
  if (!open) return
  updateSlashPosition()
})

onMounted(() => {
  window.addEventListener('resize', updateSlashPosition)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSlashPosition)
})
</script>

<template>
  <div class="relative w-full">
    <Teleport to="body">
      <JiaorongChatSlashMenu
        v-if="slashOpen"
        ref="slashMenu"
        class="fixed z-[80]"
        :style="slashMenuStyle"
        :items="filteredSlashItems"
        :query="slashRange?.query || ''"
        @select="onSelectSlash"
      />
    </Teleport>
    <div
      data-testid="chat-input-box"
      class="chat-input-box w-full overflow-hidden rounded-xl border border-border bg-card/30 shadow-sm"
      style="
        backdrop-filter: blur(var(--dc-blur-panel));
        -webkit-backdrop-filter: blur(var(--dc-blur-panel));
      "
    >
      <input ref="fileInput" type="file" class="hidden" multiple @change="onFileChange" />

      <div
        v-if="knowledgeBaseSelections.length > 0"
        class="kb-selection-chips flex flex-wrap content-start gap-2 overflow-y-auto px-4 pt-2 pb-1"
      >
        <div
          v-for="item in knowledgeBaseSelections"
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
          <button
            type="button"
            class="kb-selection-chip-remove"
            @click="emit('remove-kb', item.key)"
          >
            <Icon icon="lucide:x" class="kb-selection-chip-remove-icon" />
          </button>
        </div>
      </div>

      <div
        class="chat-input-editor chat-input-editor-flow px-4 pb-2 text-sm"
        :class="knowledgeBaseSelections.length > 0 ? 'pt-2' : 'pt-4'"
        :aria-disabled="disabled"
      >
        <span
          v-for="skill in activeSkills"
          :key="skill.skillName || skill.id"
          class="jr-inline-skill"
          data-testid="skill-chip"
          data-skill-chip
        >
          <Icon icon="lucide:sparkles" class="h-3 w-3 shrink-0" />
          <span class="jr-inline-chip-name">{{ skill.label }}</span>
          <button
            type="button"
            class="jr-inline-chip-remove"
            :aria-label="`移除 ${skill.label}`"
            @click="removeSkill(skill.skillName || '')"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
          </button>
        </span>
        <FileAttachmentChip
          v-for="(file, index) in files"
          :key="`file:${file.path ?? file.name}:${index}`"
          :file-name="file.name"
          :mime-type="file.mimeType"
          :thumbnail="file.thumbnail"
          :file-path="file.path"
          :app-id="appId"
          removable
          @remove="emit('remove-file', index)"
        />
        <textarea
          ref="textarea"
          v-model="draft"
          class="resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
          rows="1"
          :placeholder="editorPlaceholder"
          :disabled="disabled || sending"
          @keydown="onKeydown"
          @keyup="syncCursor"
          @click="syncCursor"
          @input="syncCursor"
        />
      </div>

      <div class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-1">
          <button
            v-if="attachments"
            type="button"
            class="chat-input-toolbar-icon inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="上传附件"
            :disabled="disabled"
            @click="pickFiles"
          >
            <Icon icon="lucide:plus" class="size-4" />
          </button>
          <button
            v-if="knowledgeBase"
            type="button"
            data-testid="chat-knowledge-base-button"
            class="chat-input-toolbar-icon inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="知识库"
            :disabled="disabled"
            @click="emit('open-knowledge-base')"
          >
            <img :src="knowledgeIcon" alt="知识库" class="h-4 w-4 object-contain" />
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button
            v-if="stop && buttonMode === 'stop'"
            type="button"
            data-testid="chat-stop-button"
            class="inline-flex size-7 items-center justify-center rounded-full border bg-background shadow-xs"
            title="停止"
            :disabled="disabled"
            @click="emit('stop')"
          >
            <Icon icon="lucide:square" class="h-4 w-4 text-red-500" />
          </button>
          <button
            v-else
            type="button"
            data-testid="chat-send-button"
            class="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            title="发送"
            :disabled="!canSend"
            @click="emit('send')"
          >
            <Icon icon="lucide:arrow-up" class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
