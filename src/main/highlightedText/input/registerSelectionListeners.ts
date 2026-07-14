import { platform } from 'os'
import type { SelectionRect, UiohookApi } from '../contracts/types'
import { getActiveApp, type ActiveWindowInfo } from '../selection/activeWindow'
import { isShowCardPopupApp, isSystemFileDialogWindow } from '../selection/filterSelection'
import { getSelected, markUserCopy, setControlKeyDown } from '../selection/getSelected'
import { toDipPoint } from '../windows/windowUtils'

const CTRL_KEYCODE = platform() === 'darwin' ? 3675 : 29
const DISTANCE_THRESHOLD = 5

interface SelectionListenerOptions {
  hook: UiohookApi
  keys: Record<string, number>
  isInputSuspended: () => boolean
  isCardPopupVisible: () => boolean
  hideCardPopup: () => void
  closeAssociatedWindows: () => void
  showCardPopup: (x: number, y: number, text: string) => void
}

const hasValidContent = (text: string): boolean => /\S/.test(text)

/** 保存选区矩形，供后续翻译等功能定位关联窗口。 */
function saveSelectionRect(start: { x: number; y: number }, end?: { x: number; y: number }): void {
  if (!end) {
    const dip = toDipPoint(start)
    ;(globalThis as any).selectionAnchorRect = {
      x: dip.x,
      y: dip.y,
      width: 1,
      height: 24
    } satisfies SelectionRect
    return
  }
  const tl = toDipPoint({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) })
  const br = toDipPoint({ x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) })
  ;(globalThis as any).selectionAnchorRect = {
    x: tl.x,
    y: tl.y,
    width: Math.max(1, br.x - tl.x),
    height: Math.max(1, br.y - tl.y)
  } satisfies SelectionRect
}

/** 注册全局鼠标和键盘监听，并完整保留 chat-pc 的取词状态机。 */
export function registerSelectionListeners(options: SelectionListenerOptions): void {
  const { hook, keys } = options
  let mouseDownPos = { x: 0, y: 0 }
  let activeApp: ActiveWindowInfo | undefined
  let downTime = 0
  let upTime = 0

  hook.on('mousedown', async (event) => {
    if (options.isInputSuspended()) return
    setTimeout(() => {
      options.hideCardPopup()
      options.closeAssociatedWindows()
    }, 30)
    if (event.button !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    mouseDownPos = { x: event.x, y: event.y }
    if (process.platform === 'win32') activeApp = await getActiveApp()
    if (process.platform === 'win32' && isSystemFileDialogWindow(activeApp)) return
    if (event.clicks < 2 || (process.platform === 'win32' && !isShowCardPopupApp(activeApp))) return

    const selected = await getSelected(hook, keys, true)
    if (!hasValidContent(selected.text)) return
    saveSelectionRect({ x: event.x, y: event.y })
    options.showCardPopup(event.x, event.y, selected.text)
  })

  hook.on('mouseup', async (event) => {
    if (options.isInputSuspended() || options.isCardPopupVisible()) return
    if (process.platform === 'win32' && isSystemFileDialogWindow(activeApp)) return
    if (
      event.button !== 1 ||
      event.clicks >= 2 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return

    const distance = Math.hypot(event.x - mouseDownPos.x, event.y - mouseDownPos.y)
    if (distance <= DISTANCE_THRESHOLD || !isShowCardPopupApp(activeApp)) return
    const selected = await getSelected(hook, keys)
    if (!hasValidContent(selected.text)) return
    if (process.platform === 'win32') {
      const currentApp = await getActiveApp()
      if (
        currentApp?.bounds?.x !== activeApp?.bounds?.x ||
        currentApp?.bounds?.y !== activeApp?.bounds?.y
      )
        return
    }

    const end = { x: event.x, y: event.y }
    saveSelectionRect(mouseDownPos, end)
    options.showCardPopup(
      Math.min(mouseDownPos.x, end.x),
      Math.min(mouseDownPos.y, end.y),
      selected.text
    )
  })

  hook.on('wheel', options.hideCardPopup)

  hook.on('keydown', async (event) => {
    if (event.keycode === CTRL_KEYCODE) {
      downTime = Date.now()
      setControlKeyDown(true)
    }
    const commandFlag = platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (commandFlag && event.keycode !== CTRL_KEYCODE) {
      if (Date.now() - downTime <= 50) return
      if (event.keycode === 46 || event.keycode === 45) markUserCopy()
      setControlKeyDown(true)
      options.hideCardPopup()
      return
    }
    if (event.keycode !== CTRL_KEYCODE) options.hideCardPopup()
  })

  hook.on('keyup', (event) => {
    if (event.keycode !== CTRL_KEYCODE) return
    upTime = Date.now()
    if (upTime - downTime > 20) options.hideCardPopup()
    setControlKeyDown(false)
    downTime = 0
    upTime = 0
  })
}
