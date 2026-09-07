<script setup lang="ts">
import { nextTick, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  title?: string
  renamable?: boolean
}>()

const emit = defineEmits<{
  rename: [title: string]
}>()

const editing = shallowRef(false)
const draft = ref('')
const inputEl = shallowRef<HTMLInputElement | null>(null)

watch(
  () => props.title,
  (title) => {
    if (!editing.value) draft.value = title?.trim() || ''
  },
  { immediate: true }
)

async function startRename() {
  if (props.renamable === false) return
  draft.value = props.title?.trim() || ''
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function cancelRename() {
  editing.value = false
  draft.value = props.title?.trim() || ''
}

function confirmRename() {
  if (!editing.value) return
  const next = draft.value.trim()
  editing.value = false
  if (!next || next === (props.title?.trim() || '')) return
  emit('rename', next)
}

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
      <div
        class="title-inline-shell min-w-0 flex-1"
        :class="{ 'title-inline-shell--editing': editing }"
      >
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
            icon="lucide:pencil"
            class="title-inline-icon h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        </button>
        <div v-else class="title-inline-editor flex w-full min-w-0 items-center gap-1 px-1 py-0.5">
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
