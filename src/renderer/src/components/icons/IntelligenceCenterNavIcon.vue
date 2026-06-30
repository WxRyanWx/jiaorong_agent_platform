<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  defaultSymbolId: string
  selectedSymbolId: string
  selected: boolean
}>()

const symbolId = computed(() =>
  props.selected ? props.selectedSymbolId : props.defaultSymbolId
)
</script>

<template>
  <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center">
    <svg class="h-5 w-5" viewBox="0 0 1024 1024" aria-hidden="true">
      <use :href="`#${symbolId}`" />
    </svg>
  </span>
</template>
