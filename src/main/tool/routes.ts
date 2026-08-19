import { toolsDisplayCatalogRoute, toolsListDefinitionsRoute } from '@shared/contracts/routes'
import { createRouteMap, type DeepchatRouteMap } from '@/routes/routeRegistry'
import type { ToolServicePort } from '@shared/types/tool'

export function createToolRoutes(
  toolService: Pick<
    ToolServicePort,
    'getConfigurableAgentToolDefinitions' | 'getToolDisplayCatalog'
  >
): DeepchatRouteMap {
  return createRouteMap([
    [
      toolsListDefinitionsRoute.name,
      async (rawInput) => {
        const input = toolsListDefinitionsRoute.input.parse(rawInput)
        return toolsListDefinitionsRoute.output.parse({
          tools: await toolService.getConfigurableAgentToolDefinitions(input)
        })
      }
    ],
    [
      toolsDisplayCatalogRoute.name,
      async () => {
        return toolsDisplayCatalogRoute.output.parse({
          tools: await toolService.getToolDisplayCatalog()
        })
      }
    ]
  ])
}
