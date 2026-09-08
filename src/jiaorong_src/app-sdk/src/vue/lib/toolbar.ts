export type JiaorongToolbarAction =
  | 'copy'
  | 'copyImage'
  | 'retry'
  | 'fork'
  | 'edit'
  | 'delete'

export const DEFAULT_TOOLBAR_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'edit',
  'delete'
]

const ASSISTANT_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'delete'
]

const USER_ACTIONS: readonly JiaorongToolbarAction[] = ['retry', 'copy', 'edit', 'delete']

export function resolveToolbarActions(
  toolbar?: readonly JiaorongToolbarAction[] | boolean | null
): JiaorongToolbarAction[] {
  if (toolbar === undefined || toolbar === true) return [...DEFAULT_TOOLBAR_ACTIONS]
  if (!Array.isArray(toolbar)) return []
  return [...toolbar]
}

export function toolbarHasVisibleActions(
  actions: readonly JiaorongToolbarAction[],
  role: 'assistant' | 'user'
): boolean {
  const allowed = role === 'assistant' ? ASSISTANT_ACTIONS : USER_ACTIONS
  return actions.some((action) => allowed.includes(action))
}
