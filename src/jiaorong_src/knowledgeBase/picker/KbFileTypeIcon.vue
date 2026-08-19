<script setup lang="ts">
import { computed } from 'vue'
import { resolveKbFileIconSrc } from './resolveKbFileIcon'

const props = defineProps<{
  fileName?: string | null
  extension?: string | null
  isDirectory?: boolean
  alt?: string
}>()

const src = computed(() =>
  resolveKbFileIconSrc(props.fileName || undefined, {
    isDirectory: props.isDirectory,
    extension: props.extension
  })
)
</script>

<template>
  <img class="kb-file-type-icon" :src="src" :alt="alt || ''" />
</template>
