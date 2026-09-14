/** 斜杠联想最多条数。 */
export const MAX_SLASH_RESULTS = 20

/** 读输入框里当前 / 查询。 */
export function readSlashQuery(text: string, cursor: number) {
  /** 光标前文本。 */
  const before = text.slice(0, Math.max(0, cursor))
  /** 正则匹配结果。 */
  const match = before.match(/(^|[\s])\/([^\s]*)$/)
  if (!match) return null
  /** 搜索词。 */
  const query = match[2] ?? ''
  /** 起始下标。 */
  const start = before.length - query.length - 1
  return { query, start, end: cursor }
}

/** 按查询过滤斜杠项。 */
export function filterSlashItems<
  T extends { label: string; description?: string; skillName?: string; id?: string }
>(items: readonly T[], query: string) {
  /** 规范化后的值。 */
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [...items]
  return items
    .filter((item) => {
      if (item.label.toLowerCase().includes(normalized)) return true
      if (item.skillName?.toLowerCase().includes(normalized)) return true
      if (item.id?.toLowerCase().includes(normalized)) return true
      return item.description?.toLowerCase().includes(normalized)
    })
    .slice(0, MAX_SLASH_RESULTS)
}

/** 用选中项替换 / 片段。 */
export function replaceSlashToken(
  text: string,
  range: { start: number; end: number },
  insert: string
) {
  return `${text.slice(0, range.start)}${insert}${text.slice(range.end)}`
}
