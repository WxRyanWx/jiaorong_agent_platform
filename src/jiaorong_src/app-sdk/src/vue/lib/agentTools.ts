import type { AgentToolItem, ToolMode } from '../../types'

/** 工具分组。 */
export type AgentToolGroup = {
  /** 名称。 */
  name: string
  /** 展示文案。 */
  label: string
  /** 列表项。 */
  items: string[]
}

/** 工具分组顺序。 */
const GROUP_ORDER = [
  'agent-filesystem',
  'agent-core',
  'agent-skills',
  'jiaorong-settings',
  'yobrowser'
]

/** 工具分组显示名。 */
const GROUP_LABELS: Record<string, string> = {
  'agent-filesystem': '文件系统',
  'agent-core': '核心',
  'agent-skills': '技能',
  'jiaorong-settings': '设置',
  'deepchat-settings': '设置',
  yobrowser: '浏览器'
}

/** 工具模式显示名。 */
const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  agent: 'Agent',
  code: 'Code',
  minimal: 'Minimal'
}

/** 工具模式说明。 */
const TOOL_MODE_DESCRIPTIONS: Record<ToolMode, string> = {
  agent: '使用标准 Agent 工具集',
  code: '使用代码执行入口',
  minimal: '使用精简工具集'
}

/** 可选工具模式。 */
export const TOOL_MODES: ToolMode[] = ['agent', 'code', 'minimal']

/** 工具模式显示名。 */
export function toolModeLabel(mode: ToolMode): string {
  return TOOL_MODE_LABELS[mode]
}

/** 工具模式说明。 */
export function toolModeDescription(mode: ToolMode): string {
  return TOOL_MODE_DESCRIPTIONS[mode]
}

/** 工具分组显示名。 */
export function groupLabel(groupName: string): string {
  return GROUP_LABELS[groupName] || groupName
}

/** 按分组整理工具。 */
export function groupAgentTools(tools: readonly AgentToolItem[]): AgentToolGroup[] {
  /** 分组列表。 */
  const groups = new Map<string, string[]>()
  /** 一个工具。 */
  for (const tool of tools) {
    /** 名称。 */
    const name = tool.name.trim()
    /** 分组。 */
    const group = tool.group.trim() || 'agent-core'
    if (!name) continue
    /** 列表项。 */
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
      /** 左侧下标。 */
      const leftIndex = GROUP_ORDER.indexOf(left.name)
      /** 右侧下标。 */
      const rightIndex = GROUP_ORDER.indexOf(right.name)
      if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
      if (leftIndex >= 0) return -1
      if (rightIndex >= 0) return 1
      return left.name.localeCompare(right.name)
    })
}

/** 该组工具是否全开。 */
export function isGroupEnabled(items: readonly string[], disabled: readonly string[]): boolean {
  return items.some((name) => !disabled.includes(name))
}

/** 开关整组工具。 */
export function toggleGroupDisabled(
  items: readonly string[],
  disabled: readonly string[],
  enabled: boolean
): string[] {
  /** 工具名集合。 */
  const itemSet = new Set(items)
  /** 下一步值。 */
  const next = disabled.filter((name) => !itemSet.has(name))
  if (enabled) return next
  return [...next, ...items]
}

/** 开关单个工具禁用。 */
export function toggleToolDisabled(name: string, disabled: readonly string[]): string[] {
  return disabled.includes(name) ? disabled.filter((item) => item !== name) : [...disabled, name]
}
