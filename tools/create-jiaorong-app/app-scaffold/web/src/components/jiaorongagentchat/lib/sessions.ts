/**
 * 会话列表排序：置顶优先，再按更新时间倒序。
 * 给 runtime 刷新 / 加载更多会话后重排侧栏使用。
 */

import type { SessionWithState } from '../model/host'

/**
 * 比较两条会话的展示顺序。
 * @param left 左侧会话
 * @param right 右侧会话
 * @returns 负数表示 left 更靠前；正数表示 right 更靠前
 */
export function compareSessionsByPin(left: SessionWithState, right: SessionWithState): number {
  // 置顶会话始终排在未置顶之前
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
  /** 更新时间差：正数表示 right 更新，应排在 left 前。 */
  const byUpdated = (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  // 更新时间不同时，新的在前
  if (byUpdated !== 0) return byUpdated
  // 更新时间相同则按 id 稳定排序，避免列表抖动
  return left.id.localeCompare(right.id)
}

/**
 * 按置顶与更新时间复制排序会话列表，不改原数组。
 * @param items 当前会话列表
 * @returns 新的已排序数组
 */
export function sortSessionsByPin(items: SessionWithState[]): SessionWithState[] {
  return [...items].sort(compareSessionsByPin)
}
