import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type SelectionNativeModule = {
  getSelectedText: () => string
}

let selectionNative: SelectionNativeModule | null = null

/** 加载 Windows Rust/UIA 编译的 selection Node 模块。 */
export const loadSelectionNative = (): SelectionNativeModule => {
  if (selectionNative) return selectionNative

  const candidatePaths = app.isPackaged
    ? [join(process.resourcesPath, 'bin', 'selection')]
    : [
        join(process.cwd(), 'bin', 'selection'),
        join(app.getAppPath(), 'bin', 'selection'),
        join(__dirname, '../../bin/selection')
      ]

  for (const modulePath of candidatePaths) {
    if (!existsSync(modulePath)) continue
    selectionNative = require(modulePath) as SelectionNativeModule
    return selectionNative
  }

  throw new Error(`找不到 selection 原生模块，已尝试路径: ${candidatePaths.join(', ')}`)
}
