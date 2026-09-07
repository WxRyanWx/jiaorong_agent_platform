<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import knowledgeIcon from '../assets/knowledge.png'
import { fetchHostSlashCatalog } from '../lib/hostDialog'
import { filterSlashItems, readSlashQuery, replaceSlashToken } from '../lib/slash'
import type { JiaorongKbSelection, JiaorongSlashItem } from '../types'
import JiaorongChatSlashMenu from './JiaorongChatSlashMenu.vue'
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
    files?: File[]
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
  attach: [files: File[]]
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
const hostItems = ref<JiaorongSlashItem[]>([])
const slashDismissed = shallowRef(false)
const slashMenuStyle = ref({ left: '0px', bottom: '0px' })
const placeholder = computed(() => `向 ${props.agentName} 发送消息，@ 可引用文件，/ 可使用命令`)
const canSend = computed(() => !props.disabled && !props.sending && Boolean(draft.value.trim()))
const buttonMode = computed(() => (props.generating && !draft.value.trim() ? 'stop' : 'send'))
const catalog = computed(() => (props.slashItems.length ? props.slashItems : hostItems.value))
const slashRange = computed(() => (props.slash ? readSlashQuery(draft.value, cursor.value) : null))
const slashOpen = computed(() => Boolean(slashRange.value) && !slashDismissed.value)
const filteredSlashItems = computed(() =>
  slashRange.value ? filterSlashItems(catalog.value, slashRange.value.query) : []
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

async function loadCatalog() {
  if (!props.slash || props.slashItems.length) return
  hostItems.value = await fetchHostSlashCatalog(props.appId)
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

function pickFiles() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const next = Array.from(input.files ?? [])
  input.value = ''
  if (next.length) emit('attach', next)
}

watch(slashOpen, (open) => {
  if (!open) return
  updateSlashPosition()
  void loadCatalog()
})

onMounted(() => {
  void loadCatalog()
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
        v-if="activeSkills.length > 0"
        class="flex flex-wrap gap-2 border-b border-border/50 px-4 pt-2 pb-1"
      >
        <span
          v-for="skill in activeSkills"
          :key="skill.skillName || skill.id"
          class="inline-flex max-w-full items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs shadow-sm"
        >
          <span class="text-muted-foreground">技能</span>
          <span class="max-w-[180px] truncate">{{ skill.label }}</span>
          <button type="button" @click="removeSkill(skill.skillName || '')">
            <Icon icon="lucide:x" class="h-3 w-3" />
          </button>
        </span>
      </div>

      <div
        v-if="files.length"
        class="flex flex-wrap gap-2 border-b border-border/50 px-4 pt-2 pb-1"
      >
        <span
          v-for="(file, index) in files"
          :key="`${file.name}:${index}`"
          class="inline-flex max-w-full items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs shadow-sm"
        >
          <Icon icon="lucide:paperclip" class="h-4 w-4 text-muted-foreground" />
          <span class="max-w-[180px] truncate">{{ file.name }}</span>
          <button type="button" @click="emit('remove-file', index)">
            <Icon icon="lucide:x" class="h-3 w-3" />
          </button>
        </span>
      </div>

      <div class="chat-input-editor px-4 pt-4 pb-2 text-sm" :aria-disabled="disabled">
        <textarea
          ref="textarea"
          v-model="draft"
          class="min-h-[60px] w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
          rows="3"
          :placeholder="placeholder"
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
            class="chat-input-toolbar-icon inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
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
            class="chat-input-toolbar-icon inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
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
