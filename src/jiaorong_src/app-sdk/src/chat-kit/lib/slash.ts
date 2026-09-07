export const MAX_SLASH_RESULTS = 20

export function readSlashQuery(text: string, cursor: number) {
  const before = text.slice(0, Math.max(0, cursor))
  const match = before.match(/(^|[\s])\/([^\s]*)$/)
  if (!match) return null
  const query = match[2] ?? ''
  const start = before.length - query.length - 1
  return { query, start, end: cursor }
}

export function filterSlashItems<T extends { label: string; description?: string }>(
  items: readonly T[],
  query: string
) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [...items]
  return items
    .filter((item) => {
      if (item.label.toLowerCase().includes(normalized)) return true
      return item.description?.toLowerCase().includes(normalized)
    })
    .slice(0, MAX_SLASH_RESULTS)
}

export function replaceSlashToken(
  text: string,
  range: { start: number; end: number },
  insert: string
) {
  return `${text.slice(0, range.start)}${insert}${text.slice(range.end)}`
}
