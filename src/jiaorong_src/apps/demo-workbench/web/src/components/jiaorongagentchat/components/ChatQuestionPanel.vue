<!--
  追问面板：渲染助手提问，支持单选、多选确认，以及自定义其它回答。
  主要 props：block（含提问内容的助手消息块）。
-->
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from 'jiaorong-app-sdk'
import { readQuestion } from '../lib/questions'

/** 追问面板入参，由 readQuestion 解析题干与选项 */
const props = defineProps<{
  /** 追问消息块，由 readQuestion 解析题干与选项 */
  block: AssistantMessageBlock
}>()

/** 向父级抛出的追问答案，字段含义见下方 */
const emit = defineEmits<{
  /** 提交选项答案；单选为标签，多选为顿号拼接 */
  option: [label: string]
  /** 提交自定义其它回答 */
  custom: [text: string]
}>()

/** 从消息块解析出的题干、选项与多选/其它开关 */
const question = computed(() => readQuestion(props.block))
/** 多选时已勾选的选项标签 */
const selected = ref<string[]>([])
/** 自定义其它回答草稿 */
const custom = shallowRef('')

watch(
  () => props.block.tool_call?.id || props.block.id,
  () => {
    // 换成另一道题时清空上次选择与自定义输入
    selected.value = []
    custom.value = ''
  }
)

/** 单选立即提交；多选只切换勾选，等点确认 */
function toggle(label: string) {
  if (!question.value.multiple) {
    emit('option', label)
    return
  }
  selected.value = selected.value.includes(label)
    ? selected.value.filter((item) => item !== label)
    : [...selected.value, label]
}

/** 把多选结果用顿号拼成一条选项答案 */
function confirmMulti() {
  emit('option', selected.value.join('、'))
}

/** 发送自定义回答；空文本不提交 */
function sendCustom() {
  const text = custom.value.trim()
  if (!text) return
  emit('custom', text)
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-col p-4">
    <!-- 标题 -->
    <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Icon icon="lucide:message-circle-question-mark" class="h-4 w-4" />
      <span>追问</span>
    </div>
    <!-- 题干 -->
    <p class="text-sm break-words whitespace-pre-wrap">{{ question.text }}</p>
    <!-- 选项列表 -->
    <div class="mt-4 flex flex-col gap-2">
      <button
        v-for="option in question.options"
        :key="option.label"
        type="button"
        class="flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm"
        :class="
          selected.includes(option.label)
            ? 'border-primary bg-primary/10'
            : 'bg-background/60 hover:bg-accent'
        "
        @click="toggle(option.label)"
      >
        {{ option.label }}
        <small v-if="option.description" class="mt-1 text-xs text-muted-foreground">
          {{ option.description }}
        </small>
      </button>
    </div>
    <!-- 多选才需要确认 -->
    <div v-if="question.multiple" class="mt-3 flex items-center gap-2">
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-50"
        :disabled="!selected.length"
        @click="confirmMulti"
      >
        确认
      </button>
    </div>
    <!-- 允许其它回答时展示自定义输入 -->
    <div v-if="question.allowOther" class="mt-3 flex items-center gap-2">
      <input
        v-model="custom"
        type="text"
        placeholder="其它回答"
        class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2.5 text-xs outline-none placeholder:text-muted-foreground"
        @keydown.enter.prevent="sendCustom"
      />
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-xs disabled:opacity-50"
        :disabled="!custom.trim()"
        @click="sendCustom"
      >
        发送
      </button>
    </div>
  </div>
</template>
