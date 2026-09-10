/**
 * Agent 工具分组、模式文案，以及禁用名单的切换算法。
 * 给高级设置面板按组开关工具、展示 toolMode 使用。
 */

import type { AgentToolItem, ToolMode } from 'jiaorong-app-sdk'

/**
 * 高级设置里的一组工具。
 */
export type AgentToolGroup = {
  /** 宿主分组名，如 `agent-core`。 */
  name: string
  /** 面板上的中文标题。 */
  label: string
  /** 组内工具名，已按字母排序。 */
  items: string[]
}

/** 已知分组的展示顺序；未列出的组按 name 排在后面。 */
const GROUP_ORDER = [
  'agent-filesystem',
  'agent-core',
  'agent-skills',
  'jiaorong-settings',
  'yobrowser'
]

/** 宿主分组名到面板中文标题的对照。 */
const GROUP_LABELS: Record<string, string> = {
  'agent-filesystem': '文件系统',
  'agent-core': '核心',
  'agent-skills': '技能',
  'jiaorong-settings': '设置',
  'deepchat-settings': '设置',
  yobrowser: '浏览器'
}

/** 工具模式短标题，给下拉与状态栏用。 */
const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  agent: 'Agent',
  code: 'Code',
  minimal: 'Minimal'
}

/** 工具模式一句说明，给高级设置副文案用。 */
const TOOL_MODE_DESCRIPTIONS: Record<ToolMode, string> = {
  agent: '使用标准 Agent 工具集',
  code: '使用代码执行入口',
  minimal: '使用精简工具集'
}

/** 状态栏可选的工具模式，顺序即下拉顺序。 */
export const TOOL_MODES: ToolMode[] = ['agent', 'code', 'minimal']

/**
 * 工具模式短标题。
 * @param mode Agent / Code / Minimal
 * @returns 面板展示名
 */
export function toolModeLabel(mode: ToolMode): string {
  return TOOL_MODE_LABELS[mode]
}

/**
 * 工具模式说明。
 * @param mode Agent / Code / Minimal
 * @returns 一句用途说明
 */
export function toolModeDescription(mode: ToolMode): string {
  return TOOL_MODE_DESCRIPTIONS[mode]
}

/**
 * 分组名转中文标题；未知组原样返回。
 * @param groupName 宿主 group 字段
 * @returns 面板标题
 */
export function groupLabel(groupName: string): string {
  return GROUP_LABELS[groupName] || groupName
}

/**
 * 把扁平工具列表收成带标题的分组。
 * @param tools 目录里的 Agent 工具
 * @returns 按 GROUP_ORDER 排序的分组；空名工具会被丢掉
 */
export function groupAgentTools(tools: readonly AgentToolItem[]): AgentToolGroup[] {
  /** 分组名 → 组内工具名，后写入的同名工具不重复。 */
  const groups = new Map<string, string[]>()
  for (const tool of tools) {
    /** 去掉首尾空白后的工具名。 */
    const name = tool.name.trim()
    /** 宿主分组；空串回落到核心组。 */
    const group = tool.group.trim() || 'agent-core'
    // 没有工具名无法开关，跳过
    if (!name) continue
    /** 该组已收集的工具名。 */
    const items = groups.get(group) ?? []
    // 同名工具只收一次，避免开关重复
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
      /** 左侧在白名单中的下标；-1 表示未知组。 */
      const leftIndex = GROUP_ORDER.indexOf(left.name)
      /** 右侧在白名单中的下标；-1 表示未知组。 */
      const rightIndex = GROUP_ORDER.indexOf(right.name)
      // 两边都在白名单：按固定顺序
      if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
      // 只有左侧在白名单：白名单组靠前
      if (leftIndex >= 0) return -1
      // 只有右侧在白名单：右侧靠前
      if (rightIndex >= 0) return 1
      return left.name.localeCompare(right.name)
    })
}

/**
 * 一组里只要有一个工具不在禁用名单，就视为组开启。
 * @param items 组内工具名
 * @param disabled 当前禁用名单
 * @returns 组开关应为开
 */
export function isGroupEnabled(items: readonly string[], disabled: readonly string[]): boolean {
  return items.some((name) => !disabled.includes(name))
}

/**
 * 按组开关改写禁用名单。
 * @param items 本组全部工具名
 * @param disabled 当前禁用名单
 * @param enabled true：从名单去掉本组；false：把本组全部写入名单
 * @returns 新的禁用名单（新数组）
 */
export function toggleGroupDisabled(
  items: readonly string[],
  disabled: readonly string[],
  enabled: boolean
): string[] {
  /** 本组工具名集合，用来从禁用名单里一次性摘掉。 */
  const itemSet = new Set(items)
  /** 已去掉本组后的禁用名单。 */
  const next = disabled.filter((name) => !itemSet.has(name))
  // 开启本组：名单里不再包含这些工具
  if (enabled) return next
  return [...next, ...items]
}

/**
 * 切换单个工具是否禁用。
 * @param name 工具名
 * @param disabled 当前禁用名单
 * @returns 已在名单则移除，否则追加
 */
export function toggleToolDisabled(name: string, disabled: readonly string[]): string[] {
  return disabled.includes(name) ? disabled.filter((item) => item !== name) : [...disabled, name]
}
