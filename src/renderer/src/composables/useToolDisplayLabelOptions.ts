import { computed, onMounted, ref } from 'vue'
import { createToolClient } from '@api/ToolClient'
import { useSkillsStore } from '@/stores/skillsStore'
import { useMcpStore } from '@/stores/mcp'
import { buildDisplayLabelOptions, type ToolDisplaySource } from '@/lib/slashMenuDisplayText'

export function useToolDisplayLabelOptions() {
  const skillsStore = useSkillsStore()
  const mcpStore = useMcpStore()
  const toolClient = createToolClient()
  const agentToolCatalog = ref<ToolDisplaySource[]>([])

  const loadCatalog = async () => {
    try {
      const catalog = await toolClient.getToolDisplayCatalog()
      agentToolCatalog.value = catalog.map((item) => ({
        name: item.name,
        displayName: item.displayName,
        description: item.description
      }))
    } catch (error) {
      console.warn('[useToolDisplayLabelOptions] Failed to load tool display catalog', error)
      agentToolCatalog.value = []
    }
  }

  onMounted(() => {
    void loadCatalog()
  })

  const displayLabelOptions = computed(() =>
    buildDisplayLabelOptions(skillsStore.skills, mcpStore.tools, agentToolCatalog.value)
  )

  return {
    displayLabelOptions,
    refreshToolDisplayCatalog: loadCatalog
  }
}
