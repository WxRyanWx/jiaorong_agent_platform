<!--
  会话顶栏：展示会话标题，可就地重命名。
  主要 props：title（当前标题）、renamable（是否允许改名，默认允许）。
-->
<script setup lang="ts">
import { nextTick, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'

/** 顶栏入参：当前标题与是否允许重命名 */
const props = defineProps<{
  /** 当前会话标题 */
  title?: string
  /** 为 false 时禁止进入编辑 */
  renamable?: boolean
}>()

/** 向父级抛出的顶栏事件，字段含义见下方 */
const emit = defineEmits<{
  /** 提交新会话标题 */
  rename: [title: string]
}>()

/** 是否处于标题编辑态 */
const editing = shallowRef(false)
/** 编辑中的标题草稿 */
const draft = ref('')
/** 标题输入框，进入编辑后聚焦并全选 */
const inputEl = shallowRef<HTMLInputElement | null>(null)

watch(
  () => props.title,
  (title) => {
    // 编辑中不跟外部标题同步，避免输入被覆盖
    if (!editing.value) draft.value = title?.trim() || ''
  },
  { immediate: true }
)

/** 进入重命名：写入草稿、聚焦输入框 */
async function startRename() {
  if (props.renamable === false) return
  draft.value = props.title?.trim() || ''
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

/** 取消编辑并恢复为当前标题 */
function cancelRename() {
  editing.value = false
  draft.value = props.title?.trim() || ''
}

/** 提交新标题；空值或未变化则只退出编辑 */
function confirmRename() {
  if (!editing.value) return
  const next = draft.value.trim()
  editing.value = false
  if (!next || next === (props.title?.trim() || '')) return
  emit('rename', next)
}

/** Escape 取消，Enter 提交 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    confirmRename()
  }
}
</script>

<template>
  <div
    class="sticky top-0 z-10 flex h-12 items-center justify-between bg-background/60 px-4"
    style="backdrop-filter: blur(var(--dc-blur-panel))"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <div class="min-w-0 flex-1" :class="{ 'rounded-md bg-muted/60': editing }">
        <!-- 展示态：点击进入重命名 -->
        <button
          v-if="!editing"
          type="button"
          data-testid="chat-topbar-title-trigger"
          class="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left"
          title="重命名"
          :disabled="renamable === false"
          @click="startRename"
        >
          <span class="truncate text-sm font-medium">{{ title || '新会话' }}</span>
          <Icon
            v-if="renamable !== false"
            icon="lucide:pencil"
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        </button>
        <!-- 编辑态：输入 + 取消 / 保存 -->
        <div v-else class="flex w-full min-w-0 items-center gap-1 px-1 py-0.5">
          <input
            ref="inputEl"
            v-model="draft"
            data-testid="chat-topbar-title-input"
            class="h-7 w-full min-w-0 flex-1 bg-transparent px-1 text-sm font-medium outline-none"
            aria-label="重命名会话"
            @keydown="onKeydown"
            @blur="confirmRename"
          />
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            title="取消"
            @mousedown.prevent="cancelRename"
          >
            <Icon icon="lucide:x" class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-primary"
            title="保存"
            :disabled="!draft.trim()"
            @mousedown.prevent="confirmRename"
          >
            <Icon icon="lucide:check" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
