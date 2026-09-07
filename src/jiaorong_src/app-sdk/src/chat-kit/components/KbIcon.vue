<script setup lang="ts">
import { computed } from 'vue'
import defaultBookIcon from '../assets/book.png'

const props = defineProps<{
  icon?: string | null
  alt?: string
}>()

const src = computed(() => {
  const value = props.icon?.trim()
  if (!value) return defaultBookIcon
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  return defaultBookIcon
})
</script>

<template>
  <img class="kb-icon-img" :src="src" :alt="alt || ''" />
</template>
