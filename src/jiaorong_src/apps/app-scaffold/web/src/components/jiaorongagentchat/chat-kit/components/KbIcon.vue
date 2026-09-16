<!-- 知识库封面图。非法或空 URL 回退到默认书本图标。 -->
<script setup lang="ts">
import { computed } from 'vue'
import defaultBookIcon from '../assets/book.png'

const props = defineProps<{
  /** 封面 URL（http / https / data / blob） */
  icon?: string | null
  /** 无障碍替代文本 */
  alt?: string
}>()

/** 可安全作为 img src 的地址；否则用默认书本图。 */
const src = computed(() => {
  /** 去掉首尾空白后的封面地址。 */
  const value = props.icon?.trim()
  // 空地址用默认书本图
  if (!value) return defaultBookIcon
  // 只放行常见协议，避免把相对路径当封面
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  return defaultBookIcon
})
</script>

<template>
  <!-- 知识库封面 -->
  <img class="kb-icon-img" :src="src" :alt="alt || ''" />
</template>
