<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '../../types'
import { readQuestion } from '../lib/questions'

const props = defineProps<{
  block: AssistantMessageBlock | null
}>()

const emit = defineEmits<{
  option: [label: string]
  custom: [text: string]
}>()

const question = computed(() => (props.block ? readQuestion(props.block) : null))
const selected = ref<string[]>([])
const custom = shallowRef('')

watch(
  () => props.block?.tool_call?.id || props.block?.id,
  () => {
    selected.value = []
    custom.value = ''
  }
)

function toggle(label: string) {
  if (!question.value?.multiple) {
    emit('option', label)
    return
  }
  selected.value = selected.value.includes(label)
    ? selected.value.filter((item) => item !== label)
    : [...selected.value, label]
}

function confirmMulti() {
  emit('option', selected.value.join('、'))
}

function sendCustom() {
  const text = custom.value.trim()
  if (!text) return
  emit('custom', text)
}
</script>

<template>
  <div
    v-if="block && question"
    class="tool-interaction-overlay relative mb-3 flex min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-xl p-4 text-foreground"
  >
    <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Icon icon="lucide:message-circle-question" class="h-4 w-4" />
      <span>追问</span>
    </div>
    <p class="text-sm break-words whitespace-pre-wrap">{{ question.text }}</p>
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
    <div v-if="question.allowOther" class="mt-3 flex items-center gap-2">
      <input
        v-model="custom"
        type="text"
        placeholder="其它回答"
        class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
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
