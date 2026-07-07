import type { MCPToolDefinition, ToolDisplayMetadata } from '@shared/types/core/mcp'

export function toToolDisplayMetadata(tool: MCPToolDefinition): ToolDisplayMetadata {
  const displayName = tool.function.displayName?.trim()
  return {
    name: tool.function.name,
    ...(displayName ? { displayName } : {}),
    ...(tool.function.description ? { description: tool.function.description } : {})
  }
}

export function mergeToolDisplayMetadata(
  primary: ToolDisplayMetadata[],
  secondary: ToolDisplayMetadata[]
): ToolDisplayMetadata[] {
  const byName = new Map<string, ToolDisplayMetadata>()
  for (const item of primary) {
    byName.set(item.name, item)
  }
  for (const item of secondary) {
    if (!byName.has(item.name)) {
      byName.set(item.name, item)
    }
  }
  return Array.from(byName.values())
}
