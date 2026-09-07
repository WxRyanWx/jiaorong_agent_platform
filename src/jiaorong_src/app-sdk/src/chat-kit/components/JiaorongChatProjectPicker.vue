<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { Icon } from '@iconify/vue'
import { pickHostDirectory, resolvePickedDirectory } from '../lib/hostDialog'
import type { JiaorongChatProject } from '../types'

const props = defineProps<{
  projects: readonly JiaorongChatProject[]
  selectedPath?: string | null
  appId?: string
}>()

const emit = defineEmits<{
  select: [path: string | null]
  add: [project: JiaorongChatProject]
}>()

const open = ref(false)
const folderInput = useTemplateRef<HTMLInputElement>('folderInput')
const pickError = ref('')

const selected = computed(() =>
  props.selectedPath
    ? (props.projects.find((item) => item.path === props.selectedPath) ?? {
        path: props.selectedPath,
        name: props.selectedPath.split(/[\\/]/).filter(Boolean).at(-1) || props.selectedPath
      })
    : null
)

const label = computed(() => (selected.value ? selected.value.name : '聊天'))
const icon = computed(() => (selected.value ? 'lucide:folder' : 'lucide:message-circle'))

function applyProject(project: JiaorongChatProject) {
  pickError.value = ''
  emit('add', project)
  emit('select', project.path)
  open.value = false
}

async function pickFolder() {
  pickError.value = ''
  const fromHost = await pickHostDirectory(props.appId || '')
  if (fromHost) {
    applyProject(fromHost)
    return
  }
  folderInput.value?.click()
}

function selectChat() {
  pickError.value = ''
  emit('select', null)
  open.value = false
}

function selectProject(path: string) {
  pickError.value = ''
  emit('select', path)
  open.value = false
}

function onFolderChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []) as Array<File & { path?: string }>
  input.value = ''
  const first = files[0]
  if (!first) return
  const picked = resolvePickedDirectory(first)
  if (!picked) {
    pickError.value = '无法读取完整文件夹路径，请在桌面应用内选择目录'
    return
  }
  applyProject(picked)
}
</script>

<template>
  <div class="relative" data-testid="new-thread-project-trigger">
    <input
      ref="folderInput"
      type="file"
      class="hidden"
      webkitdirectory
      multiple
      @change="onFolderChange"
    />
    <button
      type="button"
      class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      @click="open = !open"
    >
      <Icon :icon="icon" class="h-3.5 w-3.5" />
      <span>{{ label }}</span>
      <Icon icon="lucide:chevron-down" class="h-3 w-3" />
    </button>
    <div
      v-if="open"
      class="absolute top-full left-1/2 z-20 mt-1 min-w-[200px] -translate-x-1/2 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md"
    >
      <div class="px-2 py-1 text-xs text-muted-foreground">最近项目</div>
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
        @click="selectChat"
      >
        <Icon icon="lucide:message-circle" class="h-3.5 w-3.5 text-muted-foreground" />
        <span>聊天</span>
      </button>
      <div class="my-1 h-px bg-border" />
      <button
        v-for="project in projects"
        :key="project.path"
        type="button"
        class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
        @click="selectProject(project.path)"
      >
        <Icon icon="lucide:folder" class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate">{{ project.name }}</span>
          <span class="truncate text-[10px] text-muted-foreground">{{ project.path }}</span>
        </span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
        @click="pickFolder"
      >
        <Icon icon="lucide:folder-open" class="h-3.5 w-3.5 text-muted-foreground" />
        <span>打开文件夹...</span>
      </button>
      <div v-if="pickError" class="px-2 py-1 text-[10px] text-red-500">{{ pickError }}</div>
    </div>
  </div>
</template>
