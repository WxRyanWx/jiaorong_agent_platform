/** Shared think-collapse preference so history rows do not expand then collapse. */

let cachedThinkCollapse: boolean | undefined
let pendingThinkCollapse: Promise<boolean> | null = null

export function rememberThinkCollapse(value: boolean): void {
  cachedThinkCollapse = value
}

export async function loadThinkCollapse(readSetting: () => Promise<unknown>): Promise<boolean> {
  if (cachedThinkCollapse !== undefined) return cachedThinkCollapse
  if (!pendingThinkCollapse) {
    pendingThinkCollapse = Promise.resolve(readSetting())
      .then((value) => {
        cachedThinkCollapse = Boolean(value)
        return cachedThinkCollapse
      })
      .finally(() => {
        pendingThinkCollapse = null
      })
  }
  return pendingThinkCollapse
}

export function resetThinkCollapsePreference(): void {
  cachedThinkCollapse = undefined
  pendingThinkCollapse = null
}
