import type { AgentToolItem, ToolMode } from '../../types'

export type AgentToolGroup = {
  name: string
  label: string
  items: string[]
}

const GROUP_ORDER = [
  'agent-filesystem',
  'agent-core',
  'agent-skills',
  'jiaorong-settings',
  'yobrowser'
]

const GROUP_LABELS: Record<string, string> = {
  'agent-filesystem': '文件系统',
  'agent-core': '核心',
  'agent-skills': '技能',
  'jiaorong-settings': '设置',
  'deepchat-settings': '设置',
  yobrowser: '浏览器'
}

const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  agent: 'Agent',
  code: 'Code',
  minimal: 'Minimal'
}

const TOOL_MODE_DESCRIPTIONS: Record<ToolMode, string> = {
  agent: '使用标准 Agent 工具集',
  code: '使用代码执行入口',
  minimal: '使用精简工具集'
}

export const TOOL_MODES: ToolMode[] = ['agent', 'code', 'minimal']

export function toolModeLabel(mode: ToolMode): string {
  return TOOL_MODE_LABELS[mode]
}

export function toolModeDescription(mode: ToolMode): string {
  return TOOL_MODE_DESCRIPTIONS[mode]
}

export function groupLabel(groupName: string): string {
  return GROUP_LABELS[groupName] || groupName
}

export function groupAgentTools(tools: readonly AgentToolItem[]): AgentToolGroup[] {
  const groups = new Map<string, string[]>()
  for (const tool of tools) {
    const name = tool.name.trim()
    const group = tool.group.trim() || 'agent-core'
    if (!name) continue
    const items = groups.get(group) ?? []
    if (!items.includes(name)) items.push(name)
    groups.set(group, items)
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      label: groupLabel(name),
      items: [...items].sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => {
      const leftIndex = GROUP_ORDER.indexOf(left.name)
      const rightIndex = GROUP_ORDER.indexOf(right.name)
      if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
      if (leftIndex >= 0) return -1
      if (rightIndex >= 0) return 1
      return left.name.localeCompare(right.name)
    })
}

export function isGroupEnabled(items: readonly string[], disabled: readonly string[]): boolean {
  return items.some((name) => !disabled.includes(name))
}

export function toggleGroupDisabled(
  items: readonly string[],
  disabled: readonly string[],
  enabled: boolean
): string[] {
  const itemSet = new Set(items)
  const next = disabled.filter((name) => !itemSet.has(name))
  if (enabled) return next
  return [...next, ...items]
}

export function toggleToolDisabled(name: string, disabled: readonly string[]): string[] {
  return disabled.includes(name) ? disabled.filter((item) => item !== name) : [...disabled, name]
}
