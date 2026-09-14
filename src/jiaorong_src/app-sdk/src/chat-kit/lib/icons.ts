import { addCollection } from '@iconify/vue'
import lucideIcons from '@iconify-json/lucide/icons.json'
import vscodeIconsSubset from '../../vue/lib/vscode-icons-subset.json'

/** 图标是否已注册。 */
let registered = false

/** 注册 chat-kit 用到的图标。 */
export function registerJiaorongChatIcons() {
  if (registered) return
  addCollection(lucideIcons as unknown as Parameters<typeof addCollection>[0])
  addCollection(vscodeIconsSubset as unknown as Parameters<typeof addCollection>[0])
  registered = true
}
