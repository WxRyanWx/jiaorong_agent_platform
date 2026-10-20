<template>
  <McpSettings />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import McpSettings from '../../../settings/components/McpSettings.vue'
import { useMcpStore } from '@/stores/mcp'

const mcpStore = useMcpStore()

onMounted(() => {
  void mcpStore.loadOpenPlatformConnectors()
})
</script>
