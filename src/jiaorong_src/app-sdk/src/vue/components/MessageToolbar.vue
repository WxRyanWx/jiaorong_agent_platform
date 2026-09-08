<template>
  <div
    class="message-toolbar flex h-7 w-full flex-row items-center justify-between text-xs text-muted-foreground opacity-0 transition-opacity duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100"
    :class="isAssistant ? '' : 'flex-row-reverse'"
  >
    <span v-show="!loading" class="flex flex-row gap-3">
      <template v-if="isEditMode">
        <button type="button" class="toolbar-icon" title="保存" @click="emit('save')">
          <Icon icon="lucide:check" class="size-4" />
        </button>
        <button type="button" class="toolbar-icon" title="取消" @click="emit('cancel')">
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </template>
      <template v-else-if="confirmingDelete">
        <span class="self-center text-xs text-muted-foreground">删除这条消息？</span>
        <button type="button" class="toolbar-icon" title="取消" @click="confirmingDelete = false">
          <Icon icon="lucide:x" class="size-4" />
        </button>
        <button
          type="button"
          class="toolbar-icon toolbar-danger text-destructive/70 hover:bg-destructive/10"
          title="确认删除"
          @click="confirmDelete"
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
      </template>
      <template v-else>
        <button
          v-if="!isAssistant"
          type="button"
          class="toolbar-icon"
          title="重试"
          :disabled="disabled"
          @click="emit('retry')"
        >
          <Icon icon="lucide:refresh-cw" class="size-4" />
        </button>
        <button
          type="button"
          class="toolbar-icon"
          :title="copied ? '已复制' : '复制'"
          @click="onCopy"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" />
        </button>
        <button
          v-if="isAssistant"
          type="button"
          class="toolbar-icon relative"
          :title="capturing ? '正在截图…' : '复制为图片，长按从顶部复制'"
          :disabled="capturing"
          @mousedown="onCopyImageStart"
          @mouseup="onCopyImageEnd"
          @mouseleave="onCopyImageCancel"
        >
          <Icon icon="lucide:images" class="size-4" />
        </button>
        <button
          v-if="isAssistant"
          type="button"
          class="toolbar-icon"
          title="重试"
          :disabled="disabled"
          @click="emit('retry')"
        >
          <Icon icon="lucide:refresh-cw" class="size-4" />
        </button>
        <button
          v-if="isAssistant"
          type="button"
          class="toolbar-icon"
          title="分叉"
          :disabled="disabled || generating"
          @click="emit('fork')"
        >
          <Icon icon="lucide:git-branch" class="size-4" />
        </button>
        <button
          v-if="!isAssistant"
          type="button"
          class="toolbar-icon"
          title="编辑"
          :disabled="disabled"
          @click="emit('edit')"
        >
          <Icon icon="lucide:edit" class="size-3" />
        </button>
        <button
          type="button"
          class="toolbar-icon toolbar-danger text-destructive/70 hover:bg-destructive/10"
          title="删除"
          :disabled="disabled"
          @click="confirmingDelete = true"
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { copyTextToClipboard } from '../lib/copyAsImage'

const LONG_PRESS_MS = 800
const COPIED_MS = 1600

const props = withDefaults(
  defineProps<{
    isAssistant?: boolean
    loading?: boolean
    generating?: boolean
    disabled?: boolean
    isEditMode?: boolean
    capturing?: boolean
    copyText?: string
  }>(),
  {
    isAssistant: false,
    loading: false,
    generating: false,
    disabled: false,
    isEditMode: false,
    capturing: false,
    copyText: ''
  }
)

const emit = defineEmits<{
  retry: []
  delete: []
  copy: []
  copyImage: []
  copyImageFromTop: []
  edit: []
  save: []
  cancel: []
  fork: []
}>()

const copied = ref(false)
const confirmingDelete = ref(false)
let copiedTimer: number | null = null
let copyImagePressTimer: number | null = null

async function onCopy() {
  if (!props.copyText.trim()) return
  try {
    await copyTextToClipboard(props.copyText)
    copied.value = true
    if (copiedTimer !== null) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
      copiedTimer = null
    }, COPIED_MS)
    emit('copy')
  } catch {
    copied.value = false
  }
}

function onCopyImageStart() {
  if (props.capturing) return
  copyImagePressTimer = window.setTimeout(() => {
    emit('copyImageFromTop')
    copyImagePressTimer = null
  }, LONG_PRESS_MS)
}

function onCopyImageEnd() {
  if (!copyImagePressTimer) return
  window.clearTimeout(copyImagePressTimer)
  copyImagePressTimer = null
  emit('copyImage')
}

function onCopyImageCancel() {
  if (!copyImagePressTimer) return
  window.clearTimeout(copyImagePressTimer)
  copyImagePressTimer = null
}

function confirmDelete() {
  confirmingDelete.value = false
  emit('delete')
}

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer)
  if (copyImagePressTimer !== null) window.clearTimeout(copyImagePressTimer)
})
</script>

<style scoped>
.toolbar-icon {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  min-width: 1rem;
  min-height: 1rem;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition:
    color var(--dc-motion-fast) var(--dc-ease-out-soft),
    background-color var(--dc-motion-fast) var(--dc-ease-out-soft);
}

.toolbar-icon:hover:not(:disabled) {
  color: var(--primary);
}

.toolbar-icon.toolbar-danger:hover:not(:disabled) {
  color: var(--destructive);
}

.toolbar-icon:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

@media (hover: none), (pointer: coarse) {
  .message-toolbar {
    opacity: 1;
  }
}
</style>
