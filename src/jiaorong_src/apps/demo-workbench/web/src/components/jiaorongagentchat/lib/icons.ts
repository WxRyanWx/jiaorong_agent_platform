/**
 * 对话组件用到的 Iconify 图标集注册。
 * 给 JiaorongAgentChat 启动时调用一次，避免工具栏 / 附件图标空白。
 */

import { addCollection } from '@iconify/vue'
import lucideSubset from './lucide-subset.json'
import vscodeIconsSubset from './vscode-icons-subset.json'

/** 同一页面多次挂载组件时只注册一次，避免重复 addCollection。 */
let registered = false

/**
 * 把 lucide 与 vscode-icons 子集写入 Iconify。
 * 已注册过则直接返回。
 */
export function registerJiaorongAgentIcons() {
  // 热更新或 keep-alive 再次进入时跳过，集合已经在全局里
  if (registered) return
  addCollection(lucideSubset as unknown as Parameters<typeof addCollection>[0])
  addCollection(vscodeIconsSubset as unknown as Parameters<typeof addCollection>[0])
  registered = true
}
