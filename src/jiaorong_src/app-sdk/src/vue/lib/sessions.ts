import type { SessionWithState } from '../../types'

/** 置顶优先、再按更新时间比会话。 */
export function compareSessionsByPin(left: SessionWithState, right: SessionWithState): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
  /** 按更新时间比较。 */
  const byUpdated = (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  if (byUpdated !== 0) return byUpdated
  return left.id.localeCompare(right.id)
}

/** 按置顶规则排序会话。 */
export function sortSessionsByPin(items: SessionWithState[]): SessionWithState[] {
  return [...items].sort(compareSessionsByPin)
}
