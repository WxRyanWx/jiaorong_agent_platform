<!-- 斜杠命令弹出菜单：键盘上下选择、回车确认、Esc 关闭。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { JiaorongSlashItem } from '../types'

const props = defineProps<{
  /** 已过滤的候选项 */
  items: readonly JiaorongSlashItem[]
  /** 当前 `/` 后的查询串，变化时重置高亮 */
  query: string
}>()

const emit = defineEmits<{
  /** 选中一项 */
  select: [item: JiaorongSlashItem]
}>()

/** 当前高亮下标 */
const selectedIndex = ref(0)
/** 各按钮 DOM，用于滚入可视区 */
const itemElements = ref<(HTMLButtonElement | null)[]>([])

watch(
  () => props.items.length,
  (length) => {
    // 列表变短后，高亮不能越界
    if (selectedIndex.value >= length) selectedIndex.value = Math.max(0, length - 1)
  },
  { immediate: true }
)

watch(
  () => props.query,
  () => {
    // 关键字变了从第一项重新选
    selectedIndex.value = 0
  }
)

watch(selectedIndex, () => {
  itemElements.value[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
})

/** 无候选时展示空态 */
const empty = computed(() => props.items.length === 0)

/** 分类标签：skill → 技能，其余当工具。 */
function categoryTag(category: JiaorongSlashItem['category']) {
  return category === 'skill' ? '技能' : '工具'
}

/** 按下标选中；越界忽略。 */
function selectIndex(index: number) {
  /** 该下标对应的候选项。 */
  const item = props.items[index]
  // 越界或列表已空：不发 select
  if (item) emit('select', item)
}

/**
 * 输入框把键盘事件交给菜单。
 * 返回 true 表示已消费；`'close'` 表示应关菜单；false 交给输入框。
 */
function onKeyDown(event: KeyboardEvent) {
  // 上方向：循环高亮上一项
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    // 空列表仍消费方向键，避免光标乱跑
    if (!props.items.length) return true
    selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
    return true
  }
  // 下方向：循环高亮下一项
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    // 空列表仍消费方向键，避免光标乱跑
    if (!props.items.length) return true
    selectedIndex.value = (selectedIndex.value + 1) % props.items.length
    return true
  }
  // 回车：有候选则选中当前高亮
  if (event.key === 'Enter') {
    // 无候选时不拦截回车，让输入框正常发送
    if (!props.items.length) return false
    event.preventDefault()
    selectIndex(selectedIndex.value)
    return true
  }
  // Esc：告诉输入框关菜单
  if (event.key === 'Escape') {
    event.preventDefault()
    return 'close'
  }
  // 其它键交给输入框继续编辑
  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div
    class="jiaorong-slash-menu min-w-64 max-w-96 rounded-md border border-border p-1 shadow-md"
    data-testid="jiaorong-slash-menu"
  >
    <!-- 候选项列表 -->
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
    <!-- 无匹配 -->
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
