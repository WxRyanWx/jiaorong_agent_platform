import { addCollection } from '@iconify/vue'
import lucideSubset from './lucide-subset.json'
import vscodeIconsSubset from './vscode-icons-subset.json'

/** 图标是否已注册。 */
let registered = false

/** 注册 Vue 聊天图标。 */
export function registerJiaorongAgentIcons() {
  if (registered) return
  addCollection(lucideSubset as unknown as Parameters<typeof addCollection>[0])
  addCollection(vscodeIconsSubset as unknown as Parameters<typeof addCollection>[0])
  registered = true
}
