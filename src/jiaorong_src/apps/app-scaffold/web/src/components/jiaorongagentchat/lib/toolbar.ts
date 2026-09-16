/**
 * 消息气泡工具栏动作清单。
 * 给 features 解析、用户 / 助手气泡决定显示哪些按钮使用。
 */

/**
 * 工具栏可配置动作。
 * copy：复制文本；copyImage：复制为图片；retry：重试；fork：分叉会话；edit：编辑用户消息；delete：删除。
 */
export type JiaorongToolbarAction = 'copy' | 'copyImage' | 'retry' | 'fork' | 'edit' | 'delete'

/**
 * 未传 toolbar 或传 true 时的完整默认动作。
 */
export const DEFAULT_TOOLBAR_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'edit',
  'delete'
]

/** 助手气泡允许出现的动作（不含 edit，助手消息不可原地改写）。 */
const ASSISTANT_ACTIONS: readonly JiaorongToolbarAction[] = [
  'copy',
  'copyImage',
  'retry',
  'fork',
  'delete'
]

/** 用户气泡允许出现的动作（不含 copyImage / fork）。 */
const USER_ACTIONS: readonly JiaorongToolbarAction[] = ['retry', 'copy', 'edit', 'delete']

/**
 * 把超级智能体传入的 toolbar 配置收成动作数组。
 * @param toolbar true / 未传：默认全开；false / 非数组：空数组关掉工具栏；数组：按传入顺序保留
 * @returns 实际要渲染的动作列表
 */
export function resolveToolbarActions(
  toolbar?: readonly JiaorongToolbarAction[] | boolean | null
): JiaorongToolbarAction[] {
  // 未配置或显式 true：走默认完整清单
  if (toolbar === undefined || toolbar === true) return [...DEFAULT_TOOLBAR_ACTIONS]
  // false、null 或其它非数组：视为关闭工具栏
  if (!Array.isArray(toolbar)) return []
  return [...toolbar]
}

/**
 * 判断当前角色下是否还有至少一个可见动作。
 * @param actions 超级智能体解析后的动作列表
 * @param role 气泡角色，决定允许集
 * @returns 有可见动作则为 true，调用方可决定是否挂工具栏
 */
export function toolbarHasVisibleActions(
  actions: readonly JiaorongToolbarAction[],
  role: 'assistant' | 'user'
): boolean {
  /** 当前角色允许出现的动作集合。 */
  const allowed = role === 'assistant' ? ASSISTANT_ACTIONS : USER_ACTIONS
  return actions.some((action) => allowed.includes(action))
}
