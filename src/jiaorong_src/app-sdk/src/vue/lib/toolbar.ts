/** 消息工具条动作。 */
export type JiaorongToolbarAction = 'copy' | 'copyImage' | 'retry' | 'fork' | 'edit' | 'delete'

/** 默认工具条动作。 */
export const DEFAULT_TOOLBAR_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'edit',
  'delete'
]

/** 助手消息工具条动作。 */
const ASSISTANT_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'delete'
]

/** 用户消息工具条动作。 */
const USER_ACTIONS: readonly JiaorongToolbarAction[] = ['retry', 'copy', 'edit', 'delete']

/** 按角色解析消息工具条动作。 */
export function resolveToolbarActions(
  toolbar?: readonly JiaorongToolbarAction[] | boolean | null
): JiaorongToolbarAction[] {
  if (toolbar === undefined || toolbar === true) return [...DEFAULT_TOOLBAR_ACTIONS]
  if (!Array.isArray(toolbar)) return []
  return [...toolbar]
}

/** 工具条是否有可显示动作。 */
export function toolbarHasVisibleActions(
  actions: readonly JiaorongToolbarAction[],
  role: 'assistant' | 'user'
): boolean {
  /** 放行的技能名。 */
  const allowed = role === 'assistant' ? ASSISTANT_ACTIONS : USER_ACTIONS
  return actions.some((action) => allowed.includes(action))
}
