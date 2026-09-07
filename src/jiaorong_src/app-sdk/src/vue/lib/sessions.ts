import type { SessionWithState } from '../../types'

export function compareSessionsByPin(left: SessionWithState, right: SessionWithState): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
  const byUpdated = (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  if (byUpdated !== 0) return byUpdated
  return left.id.localeCompare(right.id)
}

export function sortSessionsByPin(items: SessionWithState[]): SessionWithState[] {
  return [...items].sort(compareSessionsByPin)
}
