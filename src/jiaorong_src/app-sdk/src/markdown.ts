/** 助手 Markdown 渲染辅助。 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 行内 markdown 转 HTML。 */
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

/** 是否代码围栏行。 */
function isFence(line: string) {
  return line.trimStart().startsWith('```')
}

/** 是否标题行。 */
function isHeading(line: string) {
  return /^ {0,3}#{1,6} /.test(line)
}

/** 是否无序列表行。 */
function isUnordered(line: string) {
  return /^ {0,3}[-*][ \t]+/.test(line)
}

/** 是否有序列表行。 */
function isOrdered(line: string) {
  return /^ {0,3}\d+\.[ \t]+/.test(line)
}

/** 是否分隔线。 */
function isHr(line: string) {
  return /^ {0,3}([-*_])\1{2,}[ \t]*$/.test(line)
}

/** 是否引用行。 */
function isQuote(line: string) {
  return /^ {0,3}>\s?/.test(line)
}

/** 是否表格行。 */
function isTableRow(line: string) {
  /** trim 后的字符串。 */
  const trimmed = line.trim()
  return trimmed.includes('|') && !isFence(trimmed) && !isHr(trimmed)
}

/** 是否表格对齐分隔行。 */
function isTableSeparator(line: string) {
  /** trim 后的字符串。 */
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  return /^[\s|:.-]+$/.test(trimmed)
}

/** 拆表格单元格。 */
function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** 渲染 markdown 表。 */
function renderTable(rows: string[][]) {
  /** 表头行。 */
  const head = rows[0] ?? []
  /** 响应/请求体。 */
  const body = rows.slice(1)
  /** 表头 HTML。 */
  const headHtml = head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')
  /** 表体 HTML。 */
  const bodyHtml = body
    .map((row) => {
      /** 宽度。 */
      const width = head.length || row.length
      /** 表格单元格。 */
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

/** 是否块级语法开头。 */
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

/** 聊天 markdown 转安全 HTML。 */
export function renderChatMarkdown(source: string) {
  /** 文本。 */
  const text = source.replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  /** 文本行。 */
  const lines = text.split('\n')
  /** HTML。 */
  const html: string[] = []
  /** 下标。 */
  let i = 0
  while (i < lines.length) {
    /** 一行文本。 */
    const line = lines[i] ?? ''
    if (isFence(line)) {
      /** 代码块语言。 */
      const lang = escapeHtml(line.trimStart().slice(3).trim())
      /** 响应/请求体。 */
      const body: string[] = []
      i += 1
      while (i < lines.length && !isFence(lines[i] ?? '')) {
        body.push(escapeHtml(lines[i] ?? ''))
        i += 1
      }
      if (i < lines.length) i += 1
      html.push(`<pre><code class="language-${lang}">${body.join('\n')}</code></pre>`)
      continue
    }
    if (isHr(line)) {
      html.push('<hr>')
      i += 1
      continue
    }
    if (isHeading(line)) {
      /** 标题级别。 */
      const level = Math.min(line.trimStart().match(/^#+/)?.[0].length ?? 1, 6)
      html.push(`<h${level}>${inlineMarkdown(line.replace(/^ {0,3}#{1,6} /, ''))}</h${level}>`)
      i += 1
      continue
    }
    if (isQuote(line)) {
      /** 引用行。 */
      const quotes: string[] = []
      while (i < lines.length && isQuote(lines[i] ?? '')) {
        quotes.push(inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}>\s?/, '')))
        i += 1
      }
      html.push(`<blockquote>${quotes.join('<br>')}</blockquote>`)
      continue
    }
    if (isUnordered(line)) {
      /** 列表项。 */
      const items: string[] = []
      while (i < lines.length && isUnordered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}[-*][ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (isOrdered(line)) {
      /** 列表项。 */
      const items: string[] = []
      while (i < lines.length && isOrdered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}\d+\.[ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    if (isTableRow(line)) {
      /** 多行记录。 */
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        /** 原始入参。 */
        const raw = (lines[i] ?? '').trim()
        i += 1
        if (isTableSeparator(raw)) continue
        /** 表格单元格。 */
        const cells = splitTableCells(raw)
        if (cells.some((cell) => cell.length > 0)) rows.push(cells)
      }
      if (rows.length > 0) html.push(renderTable(rows))
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    /** 段落缓冲。 */
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
