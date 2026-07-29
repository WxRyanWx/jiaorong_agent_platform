/**
 * `/` 面板展示名排序：中文（CJK）在前按拼音，英文/其它在后按字母。
 * 依赖运行时 ICU `zh-CN` collation（Electron/Chromium 可用），不引入拼音库。
 */

function firstSignificantChar(label: string): string {
  const trimmed = label.trim().replace(/^\/+/, '')
  return trimmed.charAt(0) || ''
}

/** 首字符是否为汉字（含扩展区基本判断） */
export function isCjkLeadingLabel(label: string): boolean {
  const ch = firstSignificantChar(label)
  if (!ch) return false
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(ch)
}

export function compareSlashSuggestionLabels(a: string, b: string): number {
  const aCjk = isCjkLeadingLabel(a)
  const bCjk = isCjkLeadingLabel(b)
  if (aCjk !== bCjk) {
    return aCjk ? -1 : 1
  }
  return a.trim().localeCompare(b.trim(), 'zh-CN', {
    sensitivity: 'base',
    numeric: true
  })
}
