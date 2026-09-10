function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

function isFence(line: string) {
  return line.trimStart().startsWith('```')
}

function isHeading(line: string) {
  return /^ {0,3}#{1,6} /.test(line)
}

function isUnordered(line: string) {
  return /^ {0,3}[-*][ \t]+/.test(line)
}

function isOrdered(line: string) {
  return /^ {0,3}\d+\.[ \t]+/.test(line)
}

function isHr(line: string) {
  return /^ {0,3}([-*_])\1{2,}[ \t]*$/.test(line)
}

function isQuote(line: string) {
  return /^ {0,3}>\s?/.test(line)
}

function isTableRow(line: string) {
  const trimmed = line.trim()
  return trimmed.includes('|') && !isFence(trimmed) && !isHr(trimmed)
}

function isTableSeparator(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  return /^[\s|:.-]+$/.test(trimmed)
}

function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderTable(rows: string[][]) {
  const head = rows[0] ?? []
  const body = rows.slice(1)
  const headHtml = head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')
  const bodyHtml = body
    .map((row) => {
      const width = head.length || row.length
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

export function renderChatMarkdown(source: string) {
  const text = source.replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  const lines = text.split('\n')
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (isFence(line)) {
      const lang = escapeHtml(line.trimStart().slice(3).trim())
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
      const level = Math.min(line.trimStart().match(/^#+/)?.[0].length ?? 1, 6)
      html.push(`<h${level}>${inlineMarkdown(line.replace(/^ {0,3}#{1,6} /, ''))}</h${level}>`)
      i += 1
      continue
    }
    if (isQuote(line)) {
      const quotes: string[] = []
      while (i < lines.length && isQuote(lines[i] ?? '')) {
        quotes.push(inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}>\s?/, '')))
        i += 1
      }
      html.push(`<blockquote>${quotes.join('<br>')}</blockquote>`)
      continue
    }
    if (isUnordered(line)) {
      const items: string[] = []
      while (i < lines.length && isUnordered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}[-*][ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (isOrdered(line)) {
      const items: string[] = []
      while (i < lines.length && isOrdered(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^ {0,3}\d+\.[ \t]+/, ''))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    if (isTableRow(line)) {
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        const raw = (lines[i] ?? '').trim()
        i += 1
        if (isTableSeparator(raw)) continue
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
