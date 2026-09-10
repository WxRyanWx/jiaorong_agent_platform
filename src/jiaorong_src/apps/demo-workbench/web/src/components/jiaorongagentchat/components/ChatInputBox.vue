<!--
  对话输入框：草稿、技能芯片、附件、知识库、斜杠命令，以及发送 / 停止 / 排队 / 引导。
  主要 props：sending、generating、disabled、agentName、placeholder、files、
  attachments、stop、steer、knowledgeBase、slash、queue、slashItems、
  knowledgeBaseSelections、appId。
-->
<template>
  <div class="relative w-full">
    <!-- 斜杠命令菜单，挂到 body 以免被输入框裁切 -->
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
      class="chat-input-box w-full overflow-hidden rounded-xl border bg-card/30 shadow-sm"
      style="
        backdrop-filter: blur(var(--dc-blur-panel));
        -webkit-backdrop-filter: blur(var(--dc-blur-panel));
      "
      v-on="fileDropListeners"
    >
      <input ref="fileInput" type="file" class="hidden" multiple @change="onFileSelect" />
      <!-- 已选知识库 / 文件夹芯片 -->
      <div
        v-if="knowledgeBaseSelections.length"
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
      <!-- 编辑区：技能芯片、附件芯片、文本框同行流动 -->
      <div
        class="chat-input-editor chat-input-editor-flow px-4 pb-2 text-sm"
        :class="knowledgeBaseSelections.length ? 'pt-2' : 'pt-4'"
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
          data-file-attachment
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
      <!-- 底栏：左侧附件 / 知识库，右侧发送控制 -->
      <div class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-1">
          <button
            v-if="attachments"
            type="button"
            data-testid="chat-attach-button"
            class="chat-input-toolbar-icon inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="上传附件"
            aria-label="上传附件"
            :disabled="disabled"
            @click="onPickFiles"
          >
            <Icon icon="lucide:plus" class="size-4" />
          </button>
          <button
            v-if="knowledgeBase"
            type="button"
            data-testid="chat-knowledge-base-button"
            class="chat-input-toolbar-icon inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="知识库"
            :disabled="disabled"
            @click="emit('open-knowledge-base')"
          >
            <img :src="knowledgeIcon" alt="知识库" class="h-4 w-4 object-contain" />
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button
            v-if="generating && draft.trim() && steer"
            type="button"
            data-testid="chat-steer-button"
            class="inline-flex h-7 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium shadow-xs"
            title="引导"
            :disabled="disabled"
            @click="emit('steer')"
          >
            <Icon icon="lucide:compass" class="h-4 w-4" />
            引导
          </button>
          <button
            v-if="generating && draft.trim() && queue"
            type="button"
            data-testid="chat-queue-button"
            class="inline-flex h-7 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium shadow-xs"
            title="加入队列"
            :disabled="!canSend"
            @click="emit('queue')"
          >
            <Icon icon="lucide:list-plus" class="h-4 w-4" />
            排队
          </button>
          <button
            v-else-if="generating && stop && !draft.trim()"
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
            v-else-if="!generating"
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

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import {
  browserFilesToHostPending,
  pickHostFiles,
  rememberHostDroppedFiles
} from '../chat-kit/lib/hostDialog'
import { hydratePendingAttachments } from '../chat-kit/lib/filePreview'
import { filterSlashItems, readSlashQuery, replaceSlashToken } from '../chat-kit/lib/slash'
import type { JiaorongKbSelection, JiaorongSlashItem } from '../chat-kit/types'
import JiaorongChatSlashMenu from '../chat-kit/components/JiaorongChatSlashMenu.vue'
import FileAttachmentChip from '../chat-kit/components/FileAttachmentChip.vue'
import KbFileTypeIcon from '../chat-kit/components/KbFileTypeIcon.vue'
import KbIcon from '../chat-kit/components/KbIcon.vue'
import knowledgeIcon from '../chat-kit/assets/knowledge.png'
import '../chat-kit/components/KnowledgeBaseSelectionChips.less'
import { type PendingAttachment } from '../lib/messageFiles'

/** 输入草稿，与父级双向绑定 */
const draft = defineModel<string>({ default: '' })
/** 当前已选技能芯片 */
const activeSkills = defineModel<JiaorongSlashItem[]>('activeSkills', { default: () => [] })

const props = withDefaults(
  defineProps<{
    /** 正在发送本回合 */
    sending?: boolean
    /** 助手仍在生成 */
    generating?: boolean
    /** 整框禁用 */
    disabled?: boolean
    /** 占位文案里的助手名 */
    agentName?: string
    /** 覆盖默认占位文案 */
    placeholder?: string
    /** 待发送附件 */
    files?: PendingAttachment[]
    /** 是否允许附件 */
    attachments?: boolean
    /** 生成中空草稿时显示停止 */
    stop?: boolean
    /** 生成中有草稿时允许引导 */
    steer?: boolean
    /** 是否显示知识库入口 */
    knowledgeBase?: boolean
    /** 是否解析斜杠命令 */
    slash?: boolean
    /** 生成中有草稿时允许排队 */
    queue?: boolean
    /** 斜杠命令目录 */
    slashItems?: readonly JiaorongSlashItem[]
    /** 已选知识库 / 文件夹 */
    knowledgeBaseSelections?: JiaorongKbSelection[]
    /** 宿主应用 id，选文件与预览用 */
    appId?: string
  }>(),
  {
    sending: false,
    generating: false,
    disabled: false,
    agentName: '交融对话',
    files: () => [],
    attachments: true,
    stop: true,
    steer: true,
    knowledgeBase: true,
    slash: false,
    queue: false,
    slashItems: () => [],
    knowledgeBaseSelections: () => [],
    appId: ''
  }
)

/** 发送 / 停止 / 插话 / 排队 / 附件 / 知识库 事件，全部交给父组件。 */
const emit = defineEmits<{
  send: []
  stop: []
  steer: []
  queue: []
  attach: [files: PendingAttachment[]]
  'remove-file': [index: number]
  'open-knowledge-base': []
  'remove-kb': [key: string]
}>()

/** 隐藏的 file input，宿主选文件失败时退回这里。 */
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
/** 输入框 DOM，用来读光标和算斜杠菜单位置。 */
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
/** 斜杠菜单实例，键盘上下 / 回车先交给它。 */
const slashMenu = useTemplateRef<{ onKeyDown: (event: KeyboardEvent) => boolean | 'close' }>(
  'slashMenu'
)
/** 光标位置，用来判断 / 命令范围 */
const cursor = shallowRef(0)
/** 用户关掉菜单后，同一次 query 不再自动打开 */
const slashDismissed = shallowRef(false)
/** 斜杠菜单相对视口的定位 */
const slashMenuStyle = ref({ left: '0px', bottom: '0px' })
/** 占位文案：外部传入优先，否则按是否开斜杠命令拼接 */
const placeholder = computed(() => {
  if (props.placeholder?.trim()) return props.placeholder.trim()
  return props.slash
    ? `向 ${props.agentName} 发送消息，/ 可使用命令`
    : `向 ${props.agentName} 发送消息`
})
/** 编辑区已有芯片时不再显示 textarea placeholder，避免叠字 */
const hasInlineChips = computed(() => props.files.length > 0 || activeSkills.value.length > 0)
/** 有芯片时占位留空，避免和附件 / 技能叠在一起。 */
const editorPlaceholder = computed(() => (hasInlineChips.value ? '' : placeholder.value))
/** 有正文、附件或知识库，且未禁用 / 发送中，才允许发送或排队 */
const canSend = computed(
  () =>
    !props.disabled &&
    !props.sending &&
    (Boolean(draft.value.trim()) ||
      (props.attachments && props.files.length > 0) ||
      props.knowledgeBaseSelections.length > 0)
)
/** 光标处的 /token 范围；未开 slash 时不解析 */
const slashRange = computed(() => (props.slash ? readSlashQuery(draft.value, cursor.value) : null))
/** 有匹配范围、未被关掉、且目录非空才弹出菜单 */
const slashOpen = computed(
  () => Boolean(slashRange.value) && !slashDismissed.value && props.slashItems.length > 0
)
/** 按当前 query 过滤后的斜杠项 */
const filteredSlashItems = computed(() =>
  slashRange.value ? filterSlashItems(props.slashItems, slashRange.value.query) : []
)

watch(
  () => slashRange.value?.query,
  () => {
    // query 变了视为新一次输入，允许重新弹出
    slashDismissed.value = false
  }
)

/** 把光标同步到 selectionStart，供斜杠解析使用 */
function syncCursor() {
  cursor.value = textarea.value?.selectionStart ?? draft.value.length
}

/** 把菜单锚在 textarea 上方，并避开视口边缘 */
function updateSlashPosition() {
  const rect = textarea.value?.getBoundingClientRect()
  if (!rect) return
  slashMenuStyle.value = {
    left: `${Math.max(8, rect.left)}px`,
    bottom: `${Math.max(8, window.innerHeight - rect.top + 8)}px`
  }
}

/** 选中斜杠项：技能写入芯片，其余插入文本并替换 /token */
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
  slashDismissed.value = true
}

/** 按技能名移除芯片 */
function removeSkill(skillName: string) {
  activeSkills.value = activeSkills.value.filter((item) => item.skillName !== skillName)
}

/** Enter 发送控制；先交给斜杠菜单，再按生成态分流 */
function onKeydown(event: KeyboardEvent) {
  // IME 组字中不要拦截，避免选词被当成发送
  if (event.isComposing || event.keyCode === 229) return
  if (slashOpen.value) {
    const handled = slashMenu.value?.onKeyDown(event)
    if (handled === 'close') {
      slashDismissed.value = true
      return
    }
    // 菜单已消费该键（上下选择等），不再落到发送逻辑
    if (handled) return
  }
  // 非 Enter，或 Shift+Enter 换行，都不发送
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (props.generating && draft.value.trim() && props.queue) {
    emit('queue')
    return
  }
  if (props.generating && draft.value.trim() && props.steer) {
    emit('steer')
    return
  }
  if (props.generating && !draft.value.trim() && props.stop) {
    emit('stop')
    return
  }
  if (canSend.value && !props.generating) emit('send')
}

/** 优先走宿主选文件；失败再退回隐藏的 input */
async function onPickFiles() {
  const picked = await pickHostFiles(props.appId)
  if (picked) {
    if (picked.length) {
      emit('attach', await hydratePendingAttachments(picked, props.appId))
    }
    return
  }
  fileInput.value?.click()
}

/** 附件功能开启且未禁用才接收文件 */
function canAcceptFiles() {
  return Boolean(props.attachments) && !props.disabled
}

/** 开启附件时才绑定拖放 / 粘贴 */
const fileDropListeners = computed(() => {
  if (!props.attachments) return {}
  return {
    dragenter: onDragOver,
    dragover: onDragOver,
    drop: onDrop,
    paste: onPaste
  }
})

/** 浏览器 File 转宿主待发送附件并补预览 */
async function attachBrowserFiles(list: File[]) {
  if (!canAcceptFiles() || !list.length) return
  const next = browserFilesToHostPending(list)
  const paths = next.flatMap((file) => (file.path ? [file.path] : []))
  await rememberHostDroppedFiles(paths, props.appId)
  emit('attach', await hydratePendingAttachments(next, props.appId))
}

/** 允许放置时阻止默认并显示 copy 光标 */
function onDragOver(event: DragEvent) {
  if (!canAcceptFiles()) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

/** 拖放文件进入附件列表 */
function onDrop(event: DragEvent) {
  event.preventDefault()
  if (!canAcceptFiles()) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) void attachBrowserFiles(files)
}

/** 剪贴板里有文件才拦截粘贴，避免挡掉普通文本 */
function onPaste(event: ClipboardEvent) {
  if (!canAcceptFiles()) return
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) return
  event.preventDefault()
  void attachBrowserFiles(files)
}

/** 隐藏 file input 选完后立刻清空 value，以便重复选同一文件 */
function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const next = Array.from(input.files ?? [])
  input.value = ''
  if (next.length) void attachBrowserFiles(next)
}

watch(slashOpen, (open) => {
  if (open) updateSlashPosition()
})

onMounted(() => {
  window.addEventListener('resize', updateSlashPosition)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSlashPosition)
})
</script>
