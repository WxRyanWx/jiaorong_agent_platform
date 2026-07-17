/** uiohook 原生模块在划词功能中使用的最小接口。 */
export type UiohookApi = {
  start: () => void
  stop?: () => void
  removeAllListeners?: () => void
  on: (event: string, listener: (payload: any) => void) => void
  keyTap: (key: number, modifiers?: number[]) => void
}

/** 当前划词选区在 Electron DIP 坐标系中的边界。 */
export type SelectionRect = { x: number; y: number; width: number; height: number }

/** uiohook 键值表中取词逻辑需要使用的按键。 */
export type SelectionKeyMap = Record<string, number>
