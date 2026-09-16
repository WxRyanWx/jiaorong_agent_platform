<!--
  用户消息行：头像、技能芯片、知识库 / 附件、正文，以及编辑与工具栏。
  主要 props：id、userName、timestamp、text、files、knowledgeBaseSelections、
  skills、slashItems、appId、disabled、toolbar。
-->
<template>
  <div
    data-testid="chat-message-user"
    :data-message-id="id"
    class="flex min-w-0 max-w-full flex-row-reverse group pt-5 pl-11 gap-2 user-message-item"
  >
    <!-- 用户头像 -->
    <div class="w-5 h-5 bg-muted rounded-md overflow-hidden">
      <div class="w-full h-full flex items-center justify-center text-muted-foreground">
        <Icon icon="lucide:user" class="w-4 h-4" />
      </div>
    </div>
    <div class="flex flex-col w-full space-y-1.5 items-end">
      <MessageInfo class="flex-row-reverse" :name="userName" :timestamp="timestamp" />
      <!-- 本回合启用的技能芯片 -->
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
      <!-- 气泡：附件 / 知识库 + 正文或编辑框 -->
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
      <!-- 有可见操作或正在编辑时才出工具栏 -->
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
import FileAttachmentChip from '../chat-kit/components/FileAttachmentChip.vue'
import MessageInfo from './MessageInfo.vue'
import MessageToolbar from './MessageToolbar.vue'
import KnowledgeBaseChips from '../chat-kit/components/KnowledgeBaseChips.vue'
import type { JiaorongKbChip, JiaorongSlashItem } from '../chat-kit/types'
import type { TranscriptFile } from '../lib/transcript'
import { displaySkillLabel } from '../lib/slashCommands'
import {
  resolveToolbarActions,
  toolbarHasVisibleActions,
  type JiaorongToolbarAction
} from '../lib/toolbar'

/** 用户消息行入参，供气泡、技能芯片与工具栏使用 */
const props = withDefaults(
  defineProps<{
    /** 消息 id，用于定位与测试 */
    id: string
    /** 用户显示名 */
    userName: string
    /** 发送时间戳 */
    timestamp: number
    /** 用户正文 */
    text: string
    /** 附件列表 */
    files: TranscriptFile[]
    /** 本回合选中的知识库芯片 */
    knowledgeBaseSelections?: JiaorongKbChip[]
    /** 本回合启用的技能名 */
    skills: string[]
    /** 斜杠命令目录，用于把技能名显示成标签 */
    slashItems?: readonly JiaorongSlashItem[]
    /** 超级智能体应用 id，附件预览用 */
    appId?: string
    /** 禁用重试 / 编辑 / 删除 */
    disabled?: boolean
    /** 覆盖默认工具栏动作 */
    toolbar?: JiaorongToolbarAction[]
  }>(),
  {
    knowledgeBaseSelections: () => [],
    slashItems: () => [],
    appId: ''
  }
)

/** 技能名转展示标签 */
function skillLabel(skillName: string) {
  return displaySkillLabel(skillName, props.slashItems)
}

/** 解析后的工具栏动作 */
const toolbarActions = computed(() => resolveToolbarActions(props.toolbar))
/** 用户侧是否有可见工具栏按钮 */
const showToolbar = computed(() => toolbarHasVisibleActions(toolbarActions.value, 'user'))

/** 向父级抛出的用户消息动作，字段含义见下方 */
const emit = defineEmits<{
  /** 重试本条用户消息 */
  retry: []
  /** 删除本条用户消息 */
  delete: []
  /** 保存编辑后的正文，参数为新文本 */
  save: [text: string]
}>()

/** 是否处于就地编辑 */
const isEditMode = ref(false)
/** 编辑中的正文草稿 */
const editedText = ref(props.text)
/** 编辑框 DOM，进入编辑后自动增高并聚焦 */
const editTextarea = useTemplateRef<HTMLTextAreaElement>('editTextarea')

watch(
  () => props.text,
  (value) => {
    // 编辑中不跟外部正文同步，避免输入被覆盖
    if (!isEditMode.value) editedText.value = value
  }
)

/** 按内容把编辑框撑到 scrollHeight */
function autoResize() {
  const el = editTextarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** 进入编辑：写入原文、自动增高并聚焦 */
async function startEdit() {
  editedText.value = props.text
  isEditMode.value = true
  await nextTick()
  autoResize()
  editTextarea.value?.focus()
}

/** 取消编辑并恢复原文 */
function cancelEdit() {
  isEditMode.value = false
  editedText.value = props.text
}

/** 提交编辑；空文本不保存 */
function saveEdit() {
  const next = editedText.value.trim()
  if (!next) return
  isEditMode.value = false
  emit('save', next)
}
</script>
