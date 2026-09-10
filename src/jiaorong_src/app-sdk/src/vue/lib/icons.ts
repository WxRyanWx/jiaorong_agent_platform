import { addCollection } from '@iconify/vue'
import lucideSubset from './lucide-subset.json'
import vscodeIconsSubset from './vscode-icons-subset.json'

let registered = false

export function registerJiaorongAgentIcons() {
  if (registered) return
  addCollection(lucideSubset as unknown as Parameters<typeof addCollection>[0])
  addCollection(vscodeIconsSubset as unknown as Parameters<typeof addCollection>[0])
  registered = true
}
