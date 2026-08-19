<script setup lang="ts">
import { computed } from 'vue'
import { resolveKnowledgeBaseUrl } from '../../api/knowledgeBase/config'

const iframeSrc = computed(() => resolveKnowledgeBaseUrl())
</script>

<template>
  <div class="knowledge-base-page h-full w-full min-h-0 overflow-hidden bg-background">
    <iframe
      class="knowledge-base-iframe h-full w-full border-0"
      :src="iframeSrc"
      title="Knowledge Base"
      allow="clipboard-read; clipboard-write"
      referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
    />
  </div>
</template>
