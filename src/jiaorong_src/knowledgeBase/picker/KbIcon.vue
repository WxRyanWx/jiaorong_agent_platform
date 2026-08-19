<script setup lang="ts">
import { ref, watch } from 'vue'
import defaultBookIcon from '../../assets/book.png'
import { loadKnowledgeBaseIconObjectUrl } from './resolveKbIconUrl'

const props = defineProps<{
  /** 知识库配置的 icon hash；空则用默认书本图 */
  icon?: string | null
  alt?: string
}>()

const src = ref(defaultBookIcon)
let resolveSeq = 0

async function resolveIcon() {
  const seq = ++resolveSeq
  const hash = props.icon?.trim()
  if (!hash) {
    src.value = defaultBookIcon
    return
  }
  const url = await loadKnowledgeBaseIconObjectUrl(hash)
  if (seq !== resolveSeq) return
  src.value = url || defaultBookIcon
}

watch(
  () => props.icon,
  () => {
    void resolveIcon()
  },
  { immediate: true }
)
</script>

<template>
  <img class="kb-icon-img" :src="src" :alt="alt || ''" />
</template>
