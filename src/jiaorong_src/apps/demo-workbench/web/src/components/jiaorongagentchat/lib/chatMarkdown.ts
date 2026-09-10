/**
 * 对话气泡用的轻量 Markdown 转 HTML。
 * 给助手 / 用户正文渲染：围栏代码、标题、列表、引用、表格、行内强调。
 */

/** 转义 HTML 特殊字符，防止用户正文注入标签。 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 行内：code / 粗体 / 斜体 / http(s) 链接。先 escape 再替换。 */
function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    )
}

/** 是否围栏代码起始 / 结束行（```）。 */
function isFence(line: string) {
  return line.trimStart().startsWith('```')
}

/** 是否 ATX 标题（1–6 个 # 后跟空格）。 */
function isHeading(line: string) {
  return /^ {0,3}#{1,6} /.test(line)
}

/** 是否无序列表项。 */
function isUnordered(line: string) {
  return /^ {0,3}[-*][ \t]+/.test(line)
}

/** 是否有序列表项。 */
function isOrdered(line: string) {
  return /^ {0,3}\d+\.[ \t]+/.test(line)
}

/** 是否水平分割线。 */
function isHr(line: string) {
  return /^ {0,3}([-*_])\1{2,}[ \t]*$/.test(line)
}

/** 是否引用行。 */
function isQuote(line: string) {
  return /^ {0,3}>\s?/.test(line)
}

/** 是否表格行；围栏和分割线不当表格。 */
function isTableRow(line: string) {
  /** 去掉首尾空白后再认 `|`。 */
  const trimmed = line.trim()
  return trimmed.includes('|') && !isFence(trimmed) && !isHr(trimmed)
}

/** 是否 Markdown 表格对齐分隔行（---|---）。 */
function isTableSeparator(line: string) {
  /** 去掉首尾空白后再认 `|` 与对齐字符。 */
  const trimmed = line.trim()
  // 没有竖线就不是表格分隔
  if (!trimmed.includes('|')) return false
  return /^[\s|:.-]+$/.test(trimmed)
}

/** 按 `|` 切开表格行，去掉首尾空单元格。 */
function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** 用第一行当表头，其余当表体，列数按表头对齐。 */
function renderTable(rows: string[][]) {
  /** 第一行当表头。 */
  const head = rows[0] ?? []
  /** 其余行当表体。 */
  const body = rows.slice(1)
  /** 表头单元格 HTML。 */
  const headHtml = head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')
  /** 表体各行 HTML，列数按表头对齐。 */
  const bodyHtml = body
    .map((row) => {
      /** 本行应对齐到的列数。 */
      const width = head.length || row.length
      /** 可补空单元格的副本，避免改原数组。 */
      const cells = [...row]
      while (cells.length < width) cells.push('')
      return `<tr>${cells
        .slice(0, width)
        .map((cell) => `<td>${inlineMarkdown(cell)}</td>`)
        .join('')}</tr>`
    })
    .join('')
  return (
    `<div class="md-table-wrap"><table>` +
    `<thead><tr>${headHtml}</tr></thead>` +
    `<tbody>${bodyHtml}</tbody></table></div>`
  )
}

/** 普通段落在遇到这些行时截断，改走对应块。 */
function isBlockStart(line: string) {
  return (
    isFence(line) ||
    isHeading(line) ||
    isHr(line) ||
    isUnordered(line) ||
    isOrdered(line) ||
    isQuote(line) ||
    isTableRow(line)
  )
}

/**
 * 把对话 Markdown 收成可 v-html 的片段。
 * 只覆盖聊天常见块，不做完整 CommonMark。
 * @param source 原始 Markdown
 * @returns HTML 字符串；空输入返回空串
 */
export function renderChatMarkdown(source: string) {
  /** 统一成 LF 并去掉首尾空白后的正文。 */
  const text = source.replace(/\r\n/g, '\n').trim()
  // 去掉首尾空白后没有内容：不渲染空 <p>
  if (!text) return ''
  /** 按行切开，后面用指针 i 吃块。 */
  const lines = text.split('\n')
  /** 已产出的 HTML 片段。 */
  const html: string[] = []
  /** 当前处理到的行下标。 */
  let i = 0
  while (i < lines.length) {
    /** 当前行；越界用空串，避免 undefined。 */
    const line = lines[i] ?? ''
    // 围栏代码：吃到下一道 ```，语言写在 class 上
    if (isFence(line)) {
      /** 围栏后的语言名，已转义。 */
      const lang = escapeHtml(line.trimStart().slice(3).trim())
      /** 围栏内各行，已转义。 */
      const body: string[] = []
      i += 1
      while (i < lines.length && !isFence(lines[i] ?? '')) {
        body.push(escapeHtml(lines[i] ?? ''))
        i += 1
      }
      // 吃掉结束围栏，避免下一轮再当代码
      if (i < lines.length) i += 1
      html.push(`<pre><code class="language-${lang}">${body.join('\n')}</code></pre>`)
      continue
    }
    // 单独一行分割线
    if (isHr(line)) {
      html.push('<hr>')
      i += 1
      continue
    }
    // ATX 标题单独成块
    if (isHeading(line)) {
      /** 标题级别，最多 h6。 */
      const level = Math.min(line.trimStart().match(/^#+/)?.[0].length ?? 1, 6)
      html.push(`<h${level}>${inlineMarkdown(line.replace(/^ {0,3}#{1,6} /, ''))}</h${level}>`)
      i += 1
      continue
    }
    // 连续引用行收成一块 blockquote
    if (isQuote(line)) {
      /** 引用内各行 HTML。 */
      const quotes: string[] = []
      while (i < lines.length && isQuote(lines[i] ?? '')) {
        quotes.push(inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}>\s?/, '')))
        i += 1
      }
      html.push(`<blockquote>${quotes.join('<br>')}</blockquote>`)
      continue
    }
    // 连续无序列表项收成 ul
    if (isUnordered(line)) {
      /** 无序列表项 HTML。 */
      const items: string[] = []
      while (i < lines.length && isUnordered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}[-*][ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    // 连续有序列表项收成 ol
    if (isOrdered(line)) {
      /** 有序列表项 HTML。 */
      const items: string[] = []
      while (i < lines.length && isOrdered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}\d+\.[ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    // 连续表格行收成 table
    if (isTableRow(line)) {
      /** 已解析的单元格行（不含对齐分隔）。 */
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        /** 当前表格行原文。 */
        const raw = (lines[i] ?? '').trim()
        i += 1
        // Markdown 对齐分隔行（---|---）不进单元格
        if (isTableSeparator(raw)) continue
        /** 本行列单元格。 */
        const cells = splitTableCells(raw)
        // 全空行不当有效表格行
        if (cells.some((cell) => cell.length > 0)) rows.push(cells)
      }
      // 至少有一行有效单元格才画表
      if (rows.length > 0) html.push(renderTable(rows))
      continue
    }
    // 空行只推进指针，不产出空段落
    if (!line.trim()) {
      i += 1
      continue
    }
    /** 普通段落各行，遇到空行或其它块截断。 */
    const para: string[] = [line]
    i += 1
    while (i < lines.length && (lines[i] ?? '').trim() && !isBlockStart(lines[i] ?? '')) {
      para.push(lines[i] ?? '')
      i += 1
    }
    html.push(`<p>${inlineMarkdown(para.join('\n')).replace(/\n/g, '<br>')}</p>`)
  }
  return html.join('')
}
