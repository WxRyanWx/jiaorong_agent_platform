<!--
  思考内容展示：可折叠的思考正文，生成中显示脉冲省略号。
  主要 props：label（标题）、expanded（是否展开）、thinking（是否仍在思考）、content（正文）。
-->
<template>
  <div
    class="text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50 flex flex-col gap-[6px]"
  >
    <!-- 标题行：点击切换展开 -->
    <div
      class="inline-flex items-center gap-[10px] select-none self-start"
      @click="$emit('toggle')"
    >
      <span class="whitespace-nowrap">{{ label }}</span>
      <!-- 思考中且收起：用脉冲省略号提示仍在生成 -->
      <Icon
        v-if="thinking && !expanded"
        icon="lucide:ellipsis"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
      />
      <!-- 已展开：向下箭头 -->
      <Icon
        v-else-if="expanded"
        icon="lucide:chevron-down"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
      />
      <!-- 已收起且未在思考：向右箭头 -->
      <Icon
        v-else
        icon="lucide:chevron-right"
        class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
      />
    </div>
    <!-- 展开且有正文时才渲染思考内容 -->
    <div v-if="expanded && content" class="think-prose w-full max-w-full whitespace-pre-wrap">
      {{ content }}
    </div>
    <!-- 思考中且已展开：正文下方继续提示生成中 -->
    <Icon
      v-if="thinking && expanded"
      icon="lucide:ellipsis"
      class="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
    />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

/** 思考内容入参：标题、展开态、是否仍在思考、正文 */
defineProps<{
  /** 标题，如「正在思考（第 3 秒）」 */
  label: string
  /** 是否展开正文 */
  expanded: boolean
  /** 是否仍在流式思考 */
  thinking: boolean
  /** 思考正文，可为空 */
  content?: string
}>()

/** 向父级抛出的折叠切换 */
defineEmits<{
  /** 点击标题行，切换展开 / 收起 */
  toggle: []
}>()
</script>

<style scoped>
.think-prose {
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0;
}
</style>
