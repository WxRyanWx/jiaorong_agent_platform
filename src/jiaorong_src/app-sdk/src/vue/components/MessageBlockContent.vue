<template>
  <div class="chat-markdown text-sm max-w-full break-words" v-html="html" />
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
.chat-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4),
.chat-markdown :deep(h5),
.chat-markdown :deep(h6) {
  margin: 0.75rem 0 0.4rem;
  font-weight: 600;
  line-height: 1.4;
}
.chat-markdown :deep(h1) {
  font-size: 1.125rem;
}
.chat-markdown :deep(h2) {
  font-size: 1rem;
}
.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 0.4rem 0;
  padding-left: 1.5em;
}
.chat-markdown :deep(li) {
  margin: 0.2rem 0;
}
.chat-markdown :deep(hr) {
  margin: 0.75rem 0;
  border: 0;
  border-top: 1px solid var(--border);
}
.chat-markdown :deep(blockquote) {
  margin: 0.5rem 0;
  padding-left: 0.75rem;
  border-left: 3px solid var(--border);
  color: var(--muted-foreground);
}
.chat-markdown :deep(.md-table-wrap) {
  max-width: 100%;
  margin: 0.5rem 0;
  overflow-x: auto;
}
.chat-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.4rem 0.6rem;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: normal;
}
.chat-markdown :deep(th) {
  background: hsl(0 0% 0% / 0.04);
  font-weight: 600;
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
.chat-markdown :deep(:not(pre) > code) {
  border-radius: 0.25rem;
  background: hsl(0 0% 0% / 0.05);
  padding: 0.1em 0.35em;
}
.chat-markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
</style>
