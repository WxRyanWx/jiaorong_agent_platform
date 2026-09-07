<template>
  <div class="chat-markdown text-sm max-w-full break-all" v-html="html" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayAssistantMessageBlock } from '../model/display'
import { renderChatMarkdown } from '../lib/markdown'

const props = defineProps<{
  block: DisplayAssistantMessageBlock
}>()

const html = computed(() => renderChatMarkdown(props.block.content ?? ''))
</script>

<style scoped>
.chat-markdown :deep(p) {
  margin: 0 0 0.5rem;
}
.chat-markdown :deep(pre) {
  margin: 0.5rem 0;
  padding: 0.75rem;
  max-width: 100%;
  overflow: auto;
  overflow-wrap: anywhere;
  word-break: break-word;
  border-radius: 0.5rem;
  background: var(--muted);
  font-size: 0.85em;
}
.chat-markdown :deep(code) {
  font-family: var(--dc-code-font-family);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.chat-markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
</style>
