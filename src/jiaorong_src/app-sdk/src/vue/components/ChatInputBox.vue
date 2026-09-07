<template>
  <div
    data-testid="chat-input-box"
    class="chat-input-box w-full overflow-hidden rounded-xl border bg-card/30 shadow-sm"
    style="
      backdrop-filter: blur(var(--dc-blur-panel));
      -webkit-backdrop-filter: blur(var(--dc-blur-panel));
    "
  >
    <input ref="fileInput" type="file" class="hidden" multiple @change="onFileSelect" />
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
      />
    </div>
    <div class="flex items-center justify-between px-3 py-2">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="chat-input-toolbar-icon inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="添加附件"
          :disabled="disabled"
          @click="fileInput?.click()"
        >
          <Icon icon="lucide:plus" class="size-4" />
        </button>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="generating && !draft.trim()"
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
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { Icon } from '@iconify/vue'

const draft = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    sending?: boolean
    generating?: boolean
    disabled?: boolean
    agentName?: string
    /** 自定义占位文案。不传则用「向 {agentName} 发送消息…」。 */
    placeholder?: string
    files?: File[]
  }>(),
  {
    sending: false,
    generating: false,
    disabled: false,
    agentName: '交融对话',
    files: () => []
  }
)

const emit = defineEmits<{
  send: []
  stop: []
  attach: [files: File[]]
  'remove-file': [index: number]
}>()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const placeholder = computed(
  () => props.placeholder?.trim() || `向 ${props.agentName} 发送消息`
)
const canSend = computed(() => !props.disabled && !props.sending && Boolean(draft.value.trim()))

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (props.generating && !draft.value.trim()) {
    emit('stop')
    return
  }
  if (canSend.value) emit('send')
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const next = Array.from(input.files ?? [])
  input.value = ''
  if (next.length) emit('attach', next)
}
</script>
