<!-- 知识库文件 / 文件夹类型图标，委托 resolveKbFileIconSrc。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { resolveKbFileIconSrc } from '../lib/resolveKbFileIcon'

const props = defineProps<{
  /** 文件名，用于匹配扩展名 */
  fileName?: string | null
  /** 无文件名时的扩展名兜底 */
  extension?: string | null
  /** 为 true 时固定文件夹图标 */
  isDirectory?: boolean
  /** 无障碍替代文本 */
  alt?: string
}>()

/** 对应类型的静态图标资源 */
const src = computed(() =>
  resolveKbFileIconSrc(props.fileName || undefined, {
    isDirectory: props.isDirectory,
    extension: props.extension
  })
)
</script>

<template>
  <!-- 文件类型图标 -->
  <img class="kb-file-type-icon" :src="src" :alt="alt || ''" />
</template>
