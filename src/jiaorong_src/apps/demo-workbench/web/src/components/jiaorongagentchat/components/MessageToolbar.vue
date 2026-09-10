<!--
  消息工具栏：复制、重试、编辑、删除、分叉、复制为图片；悬停出提示。
  主要 props：isAssistant、loading、generating、disabled、isEditMode、
  capturing、imageCopied、copyText、actions。
-->
<template>
  <div
    class="message-toolbar flex h-7 w-full flex-row items-center justify-between text-xs text-muted-foreground opacity-0 transition-opacity duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100"
    :class="isAssistant ? '' : 'flex-row-reverse'"
  >
    <!-- 流式 loading 时整栏按钮隐藏，避免中途操作 -->
    <span v-show="!loading" class="flex flex-row gap-3">
      <!-- 用户编辑态：保存 / 取消 -->
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
      <!-- 删除二次确认 -->
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
      <!-- 常规动作 -->
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
          <Icon icon="lucide:pencil" class="size-3" />
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
    <!-- 跟随按钮的浮动提示 -->
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

/** 长按复制图片：从消息列表顶部截取 */
const LONG_PRESS_MS = 800
/** 「已复制」提示停留时长 */
const COPIED_MS = 1600

/** 工具栏入参，控制布局、禁用与可展示动作 */
const props = withDefaults(
  defineProps<{
    /** 助手消息用正向布局，用户消息反向 */
    isAssistant?: boolean
    /** 流式中隐藏动作按钮 */
    loading?: boolean
    /** 线程生成中时禁用分叉 */
    generating?: boolean
    /** 禁用写操作 */
    disabled?: boolean
    /** 用户消息编辑态 */
    isEditMode?: boolean
    /** 父级正在截图 */
    capturing?: boolean
    /** 截图复制成功，触发闪提示 */
    imageCopied?: boolean
    /** 纯文本复制内容 */
    copyText?: string
    /** 允许展示的动作白名单 */
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

/** 向父级抛出的工具栏动作，字段含义见下方 */
const emit = defineEmits<{
  /** 重试本条消息 */
  retry: []
  /** 确认删除本条消息 */
  delete: []
  /** 纯文本已复制，供父级埋点 */
  copy: []
  /** 截取本条内容为图片 */
  copyImage: []
  /** 从消息列表顶部开始截图 */
  copyImageFromTop: []
  /** 进入用户消息编辑 */
  edit: []
  /** 保存用户消息编辑 */
  save: []
  /** 取消用户消息编辑 */
  cancel: []
  /** 从本条助手消息分叉会话 */
  fork: []
}>()

/** 当前启用的动作集合 */
const enabledActions = computed(() => new Set(resolveToolbarActions(props.actions)))

/** 该动作是否在白名单里 */
function showAction(action: JiaorongToolbarAction) {
  return enabledActions.value.has(action)
}

/** 文本刚复制成功 */
const copied = ref(false)
/** 进入删除二次确认 */
const confirmingDelete = ref(false)
/** 当前浮动提示文案 */
const tip = ref('')
/** 提示定位（相对视口） */
const tipStyle = ref<Record<string, string>>({})
/** 「已复制」状态复位定时器，给 onCopy 用 */
let copiedTimer: number | null = null
/** 长按复制图片的计时器，超时则从列表顶部截图 */
let copyImagePressTimer: number | null = null
/** 复制图片提示自动清除定时器，给 flashCopyImageTip 用 */
let copyImageHintTimer: number | null = null
/** 截图成功后的短暂提示，优先于默认 tip */
const copyImageHint = ref('')

/** 复制图片按钮的悬停文案 */
const copyImageTip = computed(() => {
  if (props.capturing) return '正在截图…'
  if (copyImageHint.value) return copyImageHint.value
  return '复制为图片（长按可从顶部开始截取）'
})

/** 在按钮上方居中显示提示 */
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

/** 隐藏浮动提示 */
function hideTip() {
  tip.value = ''
}

/** 短暂覆盖复制图片提示，到时自动清掉 */
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

/** 复制纯文本；空内容直接返回 */
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

/** 按下：启动长按计时，超时则从列表顶部截图 */
function onCopyImageStart() {
  if (props.capturing) return
  copyImagePressTimer = window.setTimeout(() => {
    emit('copyImageFromTop')
    copyImagePressTimer = null
  }, LONG_PRESS_MS)
}

/** 松开时若长按未触发，则只截本条内容 */
function onCopyImageEnd() {
  if (!copyImagePressTimer) return
  window.clearTimeout(copyImagePressTimer)
  copyImagePressTimer = null
  emit('copyImage')
}

/** 取消尚未触发的长按 */
function onCopyImageCancel() {
  if (copyImagePressTimer !== null) {
    window.clearTimeout(copyImagePressTimer)
    copyImagePressTimer = null
  }
}

/** 指针离开按钮：取消长按并收起提示 */
function onCopyImageLeave() {
  onCopyImageCancel()
  hideTip()
}

/** 键盘：Enter / 空格截本条，Shift 组合从顶部截 */
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

/** 确认删除并退出二次确认态 */
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
