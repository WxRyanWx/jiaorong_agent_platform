<!-- 附件芯片：图片可点开预览，其它类型仅展示；可选移除按钮。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { getFileTypeIcon, isImageAttachment } from '../../lib/fileTypeIcon'
import { readHostFilePreview } from '../lib/filePreview'

const props = withDefaults(
  defineProps<{
    /** 文件名 */
    fileName?: string | null
    /** MIME，用于判断是否图片 */
    mimeType?: string | null
    /** 已有缩略图 Data URL */
    thumbnail?: string | null
    /** 绝对路径，缺缩略图时向 Host 要预览 */
    filePath?: string | null
    /** Host appId */
    appId?: string | null
    /** 是否显示移除按钮 */
    removable?: boolean
  }>(),
  {
    fileName: '',
    mimeType: '',
    thumbnail: '',
    filePath: '',
    appId: '',
    removable: false
  }
)

const emit = defineEmits<{
  /** 非图片或预览失败时的点击 */
  click: []
  /** 点移除 */
  remove: []
}>()

/** 大图预览是否打开 */
const previewOpen = ref(false)
/** 当前缩略图 / 大图 src */
const previewSrc = ref(props.thumbnail?.trim() || '')
/** 正在向 Host 拉预览 */
const loadingPreview = ref(false)
/** 展示名，空则用 `file` */
const name = computed(() => props.fileName?.trim() || 'file')
/** 非图片时的类型图标 */
const icon = computed(() => getFileTypeIcon(name.value, props.mimeType || undefined))
/** 是否按图片处理 */
const isImage = computed(() => isImageAttachment(name.value, props.mimeType || undefined))
/** 有缩略图或绝对路径时，芯片可点开展示 */
const canPreview = computed(
  () => isImage.value && Boolean(previewSrc.value || props.filePath?.trim())
)

watch(
  () => props.thumbnail,
  (value) => {
    /** 父级新传入的缩略图。 */
    const next = value?.trim() || ''
    // 空串不覆盖已向 Host 拉到的预览
    if (next) previewSrc.value = next
  }
)

/** 没有 src 时向 Host 要缩略图；已有或非图片直接返回。 */
async function ensurePreviewSrc() {
  // 已有 src 或非图片：不必向 Host 要预览
  if (previewSrc.value || !isImage.value) return previewSrc.value
  /** 用来向 Host 读预览的绝对路径。 */
  const filePath = props.filePath?.trim() || ''
  // 无路径或已在请求中，避免重复 invoke
  if (!filePath || loadingPreview.value) return previewSrc.value
  loadingPreview.value = true
  try {
    /** 宿主返回的缩略图。 */
    const preview = await readHostFilePreview(filePath, props.appId || undefined)
    // 只有拿到缩略图才写入，避免空串盖掉
    if (preview?.thumbnail) previewSrc.value = preview.thumbnail
  } finally {
    loadingPreview.value = false
  }
  return previewSrc.value
}

/** 图片：尽量打开预览；否则把点击交给父级。 */
async function onChipClick() {
  // 非图片：预览对话框用不上，交给父级
  if (!isImage.value) {
    emit('click')
    return
  }
  // 预览请求进行中不重复打开
  if (loadingPreview.value) return
  /** 尽量补齐后的预览地址。 */
  const src = await ensurePreviewSrc()
  // 有图才开全屏预览
  if (src) {
    previewOpen.value = true
    return
  }
  emit('click')
}

/** 阻止冒泡，避免同时触发芯片点击。 */
function onRemove(event: Event) {
  event.stopPropagation()
  emit('remove')
}
</script>

<template>
  <!-- 附件芯片 -->
  <span
    class="group inline-flex max-w-full items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm transition-colors hover:bg-accent"
    :class="canPreview ? 'cursor-pointer' : 'cursor-default'"
    data-testid="chat-attachment-item"
    data-file-attachment
    @click="onChipClick"
  >
    <img
      v-if="previewSrc"
      :src="previewSrc"
      class="h-5 w-5 shrink-0 rounded-full border object-cover"
      alt=""
    />
    <Icon v-else :icon="icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
    <span class="max-w-[180px] truncate">{{ name }}</span>
    <button
      v-if="removable"
      type="button"
      class="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      :aria-label="`移除 ${name}`"
      @click="onRemove"
    >
      <Icon icon="lucide:x" class="h-3 w-3" />
    </button>
  </span>
  <!-- 图片全屏预览 -->
  <Teleport to="body">
    <div
      v-if="previewOpen && previewSrc"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6"
      data-testid="attachment-image-preview"
      @click="previewOpen = false"
    >
      <img
        :src="previewSrc"
        :alt="name"
        class="max-h-full max-w-full rounded-md object-contain shadow-lg"
        @click.stop
      />
    </div>
  </Teleport>
</template>
