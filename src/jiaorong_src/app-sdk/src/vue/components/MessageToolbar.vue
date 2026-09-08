<template>
  <div
    class="message-toolbar flex h-7 w-full flex-row items-center justify-between text-xs text-muted-foreground opacity-0 transition-opacity duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100"
    :class="isAssistant ? '' : 'flex-row-reverse'"
  >
    <span v-show="!loading" class="flex flex-row gap-3">
      <template v-if="isEditMode">
        <button
          type="button"
          class="toolbar-icon"
          @mouseenter="showTip($event, '保存')"
          @mouseleave="hideTip"
          @click="emit('save')"
        >
          <Icon icon="lucide:check" class="size-4" />
        </button>
        <button
          type="button"
          class="toolbar-icon"
          @mouseenter="showTip($event, '取消')"
          @mouseleave="hideTip"
          @click="emit('cancel')"
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </template>
      <template v-else-if="confirmingDelete">
        <span class="self-center text-xs text-muted-foreground">删除这条消息？</span>
        <button
          type="button"
          class="toolbar-icon"
          @mouseenter="showTip($event, '取消')"
          @mouseleave="hideTip"
          @click="confirmingDelete = false"
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
        <button
          type="button"
          class="toolbar-icon toolbar-danger text-destructive/70 hover:bg-destructive/10"
          @mouseenter="showTip($event, '确认删除')"
          @mouseleave="hideTip"
          @click="confirmDelete"
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
      </template>
      <template v-else>
        <button
          v-if="!isAssistant && showAction('retry')"
          type="button"
          class="toolbar-icon"
          :disabled="disabled"
          @mouseenter="showTip($event, '重试')"
          @mouseleave="hideTip"
          @click="emit('retry')"
        >
          <Icon icon="lucide:refresh-cw" class="size-4" />
        </button>
        <button
          v-if="showAction('copy')"
          type="button"
          class="toolbar-icon"
          @mouseenter="showTip($event, copied ? '已复制' : '复制')"
          @mouseleave="hideTip"
          @click="onCopy"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" />
        </button>
        <button
          v-if="isAssistant && showAction('copyImage')"
          type="button"
          class="toolbar-icon relative"
          :disabled="capturing"
          @mouseenter="showTip($event, copyImageTip)"
          @mousedown.prevent="onCopyImageStart"
          @mouseup="onCopyImageEnd"
          @mouseleave="onCopyImageLeave"
          @keydown="onCopyImageKeydown"
        >
          <Icon icon="lucide:images" class="size-4" />
        </button>
        <button
          v-if="isAssistant && showAction('retry')"
          type="button"
          class="toolbar-icon"
          :disabled="disabled"
          @mouseenter="showTip($event, '重试')"
          @mouseleave="hideTip"
          @click="emit('retry')"
        >
          <Icon icon="lucide:refresh-cw" class="size-4" />
        </button>
        <button
          v-if="isAssistant && showAction('fork')"
          type="button"
          class="toolbar-icon"
          :disabled="disabled || generating"
          @mouseenter="showTip($event, '分叉')"
          @mouseleave="hideTip"
          @click="emit('fork')"
        >
          <Icon icon="lucide:git-branch" class="size-4" />
        </button>
        <button
          v-if="!isAssistant && showAction('edit')"
          type="button"
          class="toolbar-icon"
          :disabled="disabled"
          @mouseenter="showTip($event, '编辑')"
          @mouseleave="hideTip"
          @click="emit('edit')"
        >
          <Icon icon="lucide:edit" class="size-3" />
        </button>
        <button
          v-if="showAction('delete')"
          type="button"
          class="toolbar-icon toolbar-danger text-destructive/70 hover:bg-destructive/10"
          :disabled="disabled"
          @mouseenter="showTip($event, '删除')"
          @mouseleave="hideTip"
          @click="confirmingDelete = true"
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
      </template>
    </span>
    <Teleport to="body">
      <div v-if="tip" class="jr-toolbar-tip" :style="tipStyle">{{ tip }}</div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { copyTextToClipboard } from '../lib/copyAsImage'
import { resolveToolbarActions, type JiaorongToolbarAction } from '../lib/toolbar'

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
    imageCopied?: boolean
    copyText?: string
    actions?: JiaorongToolbarAction[]
  }>(),
  {
    isAssistant: false,
    loading: false,
    generating: false,
    disabled: false,
    isEditMode: false,
    capturing: false,
    imageCopied: false,
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

const enabledActions = computed(() => new Set(resolveToolbarActions(props.actions)))

function showAction(action: JiaorongToolbarAction) {
  return enabledActions.value.has(action)
}

const copied = ref(false)
const confirmingDelete = ref(false)
const tip = ref('')
const tipStyle = ref<Record<string, string>>({})
let copiedTimer: number | null = null
let copyImagePressTimer: number | null = null
let copyImageHintTimer: number | null = null
const copyImageHint = ref('')

const copyImageTip = computed(() => {
  if (props.capturing) return '正在截图…'
  if (copyImageHint.value) return copyImageHint.value
  return '复制为图片（长按可从顶部开始截取）'
})

function showTip(event: Event, text: string) {
  const el = event.currentTarget
  if (!(el instanceof HTMLElement) || !text) return
  const rect = el.getBoundingClientRect()
  tip.value = text
  tipStyle.value = {
    left: `${Math.round(rect.left + rect.width / 2)}px`,
    top: `${Math.round(rect.top - 8)}px`
  }
}

function hideTip() {
  tip.value = ''
}

function flashCopyImageTip(text: string) {
  copyImageHint.value = text
  if (tip.value) tip.value = text
  if (copyImageHintTimer !== null) window.clearTimeout(copyImageHintTimer)
  copyImageHintTimer = window.setTimeout(() => {
    copyImageHint.value = ''
    copyImageHintTimer = null
    if (tip.value === text) hideTip()
  }, COPIED_MS)
}

async function onCopy() {
  if (!props.copyText.trim()) return
  try {
    await copyTextToClipboard(props.copyText)
    copied.value = true
    tip.value = '已复制'
    if (copiedTimer !== null) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
      copiedTimer = null
      if (tip.value === '已复制') hideTip()
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
  if (copyImagePressTimer !== null) {
    window.clearTimeout(copyImagePressTimer)
    copyImagePressTimer = null
  }
}

function onCopyImageLeave() {
  onCopyImageCancel()
  hideTip()
}

function onCopyImageKeydown(event: KeyboardEvent) {
  if (!['Enter', ' '].includes(event.key) || event.repeat || props.capturing) return
  event.preventDefault()
  if (event.shiftKey) {
    emit('copyImageFromTop')
    return
  }
  emit('copyImage')
}

watch(
  () => props.imageCopied,
  (copied) => {
    if (copied) flashCopyImageTip('已复制为图片')
  },
  { immediate: true }
)

function confirmDelete() {
  confirmingDelete.value = false
  emit('delete')
}

onMounted(() => {
  window.addEventListener('scroll', hideTip, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', hideTip, true)
  if (copiedTimer !== null) window.clearTimeout(copiedTimer)
  if (copyImagePressTimer !== null) window.clearTimeout(copyImagePressTimer)
  if (copyImageHintTimer !== null) window.clearTimeout(copyImageHintTimer)
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

<style>
.jr-toolbar-tip {
  position: fixed;
  z-index: 80;
  padding: 4px 8px;
  border-radius: 6px;
  background: hsl(0 0% 15%);
  color: #fff;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, -100%);
  box-shadow: 0 4px 12px hsl(0 0% 0% / 0.18);
}

.jr-toolbar-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border: 5px solid transparent;
  border-top-color: hsl(0 0% 15%);
}
</style>
