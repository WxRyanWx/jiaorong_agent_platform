<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { JiaorongSlashItem } from '../types'

const props = defineProps<{
  items: readonly JiaorongSlashItem[]
  query: string
}>()

const emit = defineEmits<{
  select: [item: JiaorongSlashItem]
}>()

const selectedIndex = ref(0)
const itemElements = ref<(HTMLButtonElement | null)[]>([])

watch(
  () => props.items.length,
  (length) => {
    if (selectedIndex.value >= length) selectedIndex.value = Math.max(0, length - 1)
  },
  { immediate: true }
)

watch(
  () => props.query,
  () => {
    selectedIndex.value = 0
  }
)

watch(selectedIndex, () => {
  itemElements.value[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
})

const empty = computed(() => props.items.length === 0)

function categoryTag(category: JiaorongSlashItem['category']) {
  return category === 'skill' ? '技能' : '工具'
}

function selectIndex(index: number) {
  const item = props.items[index]
  if (item) emit('select', item)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!props.items.length) return true
    selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
    return true
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!props.items.length) return true
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length
    return true
  }
  if (event.key === 'Enter') {
    if (!props.items.length) return false
    event.preventDefault()
    selectIndex(selectedIndex.value)
    return true
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    return 'close'
  }
  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div
    class="jiaorong-slash-menu min-w-64 max-w-96 rounded-md border border-border p-1 shadow-md"
    data-testid="jiaorong-slash-menu"
  >
    <div v-if="!empty" class="max-h-96 overflow-y-auto">
      <button
        v-for="(item, index) in items"
        :key="item.id"
        :ref="(el) => (itemElements[index] = el as HTMLButtonElement | null)"
        type="button"
        class="w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
        :class="index === selectedIndex ? 'bg-accent text-accent-foreground' : ''"
        @mousedown.prevent="selectIndex(index)"
      >
        <div class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-4 w-8 shrink-0 items-center justify-center text-xs text-muted-foreground"
          >
            {{ categoryTag(item.category) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ item.label }}</div>
            <div v-if="item.description" class="truncate text-xs text-muted-foreground">
              {{ item.description }}
            </div>
          </div>
        </div>
      </button>
    </div>
    <div v-else class="px-3 py-2 text-sm text-muted-foreground">没有结果</div>
  </div>
</template>

<style scoped>
.jiaorong-slash-menu {
  background: #ffffff;
  color: #262626;
  opacity: 1;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
}
</style>
