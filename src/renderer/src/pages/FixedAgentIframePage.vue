<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <iframe
      v-if="iframeUrl"
      :key="iframeRenderKey"
      :src="iframeUrl"
      :title="pageTitle"
      class="h-full w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getFixedIframeAgent,
  isFixedIframeAgentId
} from '@shared/fixedIframeAgents'
import { useAgentStore } from '@/stores/ui/agent'

const props = defineProps<{
  agentId: string
}>()

const { t } = useI18n()
const agentStore = useAgentStore()

const agentDefinition = computed(() => getFixedIframeAgent(props.agentId))
const iframeUrl = computed(() => {
  if (!isFixedIframeAgentId(props.agentId)) {
    return ''
  }

  return agentStore.resolveFixedIframeUrl(props.agentId)
})
const iframeRenderKey = computed(() => {
  if (!isFixedIframeAgentId(props.agentId)) {
    return ''
  }

  return `${iframeUrl.value}::${agentStore.getFixedIframeReloadNonce(props.agentId)}`
})
const pageTitle = computed(() =>
  agentDefinition.value ? t(agentDefinition.value.nameKey) : props.agentId
)
</script>
