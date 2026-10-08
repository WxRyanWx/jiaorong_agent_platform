/**
 * 斜杠命令解析：从光标前读 `/query`，按关键字过滤候选项，并替换输入中的斜杠片段。
 */

/** 斜杠菜单最多展示条数，避免长列表卡住输入。 */
export const MAX_SLASH_RESULTS = 20

/**
 * 读取光标前正在输入的斜杠查询。
 * 无 `/` 或 `/` 前不是行首 / 空白时返回 null，菜单应关闭。
 */
export function readSlashQuery(text: string, cursor: number) {
  /** 光标前的文本，用来找独立 `/token`。 */
  const before = text.slice(0, Math.max(0, cursor))
  /** 行首或空白后的 `/query`。 */
  const match = before.match(/(^|[\s])\/([^\s]*)$/)
  // 光标前没有独立 `/token`，不打开菜单
  if (!match) return null
  /** `/` 后面已输入的关键字。 */
  const query = match[2] ?? ''
  /** 斜杠 token 在全文中的起点（含 `/`）。 */
  const start = before.length - query.length - 1
  return { query, start, end: cursor }
}

/**
 * 按 label / skillName / id / description 模糊过滤，并截到 {@link MAX_SLASH_RESULTS}。
 * 空查询原样返回全部，由调用方自己分页展示。
 */
export function filterSlashItems<
  T extends { label: string; description?: string; skillName?: string; id?: string }
>(items: readonly T[], query: string) {
  /** 小写关键字，用来做包含匹配。 */
  const normalized = query.trim().toLowerCase()
  // 未输入关键字：展示完整目录
  if (!normalized) return [...items]
  return items
    .filter((item) => {
      // 标题命中
      if (item.label.toLowerCase().includes(normalized)) return true
      // 技能全名命中
      if (item.skillName?.toLowerCase().includes(normalized)) return true
      // 稳定 id 命中
      if (item.id?.toLowerCase().includes(normalized)) return true
      return item.description?.toLowerCase().includes(normalized)
    })
    .slice(0, MAX_SLASH_RESULTS)
}

/**
 * 用插入文本替换 `[start, end)` 这一段斜杠 token。
 */
export function replaceSlashToken(
  text: string,
  range: { start: number; end: number },
  insert: string
) {
  return `${text.slice(0, range.start)}${insert}${text.slice(range.end)}`
}
