<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { getFileTypeIcon, isImageAttachment } from '../../fileTypeIcon'
import { readHostFilePreview } from '../lib/filePreview'

const props = withDefaults(
  defineProps<{
    fileName?: string | null
    mimeType?: string | null
    thumbnail?: string | null
    filePath?: string | null
    appId?: string | null
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
  click: []
  remove: []
}>()

const previewOpen = ref(false)
const previewSrc = ref(props.thumbnail?.trim() || '')
const loadingPreview = ref(false)
const name = computed(() => props.fileName?.trim() || 'file')
const icon = computed(() => getFileTypeIcon(name.value, props.mimeType || undefined))
const isImage = computed(() => isImageAttachment(name.value, props.mimeType || undefined))
const canPreview = computed(() => isImage.value && Boolean(previewSrc.value || props.filePath?.trim()))

watch(
  () => props.thumbnail,
  (value) => {
    const next = value?.trim() || ''
    if (next) previewSrc.value = next
  }
)

async function ensurePreviewSrc() {
  if (previewSrc.value || !isImage.value) return previewSrc.value
  const filePath = props.filePath?.trim() || ''
  if (!filePath || loadingPreview.value) return previewSrc.value
  loadingPreview.value = true
  try {
    const preview = await readHostFilePreview(filePath, props.appId || undefined)
    if (preview?.thumbnail) previewSrc.value = preview.thumbnail
  } finally {
    loadingPreview.value = false
  }
  return previewSrc.value
}

async function onChipClick() {
  if (!isImage.value) {
    emit('click')
    return
  }
  if (loadingPreview.value) return
  const src = await ensurePreviewSrc()
  if (src) {
    previewOpen.value = true
    return
  }
  emit('click')
}

function onRemove(event: Event) {
  event.stopPropagation()
  emit('remove')
}
</script>

<template>
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
