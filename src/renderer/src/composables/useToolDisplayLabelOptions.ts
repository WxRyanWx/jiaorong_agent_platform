import { computed, onMounted, ref } from 'vue'
import { createToolClient } from '@api/ToolClient'
import { useSkillsStore } from '@/stores/skillsStore'
import { useMcpStore } from '@/stores/mcp'
import { buildDisplayLabelOptions, type ToolDisplaySource } from '@/lib/slashMenuDisplayText'

let sharedCatalog: ToolDisplaySource[] | null = null
let sharedCatalogPromise: Promise<ToolDisplaySource[]> | null = null

async function loadSharedToolDisplayCatalog(): Promise<ToolDisplaySource[]> {
  if (sharedCatalog) {
    return sharedCatalog
  }
  if (!sharedCatalogPromise) {
    const toolClient = createToolClient()
    sharedCatalogPromise = toolClient
      .getToolDisplayCatalog()
      .then((catalog) => {
        sharedCatalog = catalog.map((item) => ({
          name: item.name,
          displayName: item.displayName,
          description: item.description
        }))
        return sharedCatalog
      })
      .catch((error) => {
        sharedCatalogPromise = null
        console.warn('[useToolDisplayLabelOptions] Failed to load tool display catalog', error)
        return []
      })
  }
  return sharedCatalogPromise
}

export function useToolDisplayLabelOptions() {
  const skillsStore = useSkillsStore()
  const mcpStore = useMcpStore()
  const agentToolCatalog = ref<ToolDisplaySource[]>(sharedCatalog ?? [])

  const loadCatalog = async () => {
    agentToolCatalog.value = await loadSharedToolDisplayCatalog()
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
