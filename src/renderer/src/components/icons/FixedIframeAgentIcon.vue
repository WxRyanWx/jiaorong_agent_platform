<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    iconClass: string
    selected?: boolean
    sizeClass?: string
  }>(),
  {
    selected: false,
    sizeClass: 'text-[18px]'
  }
)
</script>

<template>
  <i
    class="iconfont leading-none transition-colors duration-150"
    :class="[
      props.iconClass,
      props.sizeClass,
      props.selected ? 'text-[#1d2129] dark:text-foreground' : 'text-[#86909C] dark:text-muted-foreground'
    ]"
    aria-hidden="true"
  />
</template>
