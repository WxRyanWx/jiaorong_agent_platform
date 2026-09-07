import { addCollection } from '@iconify/vue'
import lucideIcons from '@iconify-json/lucide/icons.json'

let registered = false

export function registerJiaorongChatIcons() {
  if (registered) return
  addCollection(lucideIcons as unknown as Parameters<typeof addCollection>[0])
  registered = true
}
