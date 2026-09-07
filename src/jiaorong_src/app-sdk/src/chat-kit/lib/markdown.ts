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

export function renderChatMarkdown(source: string) {
  const text = source.replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  const lines = text.split('\n')
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.startsWith('```')) {
      const lang = escapeHtml(line.slice(3).trim())
      const body: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        body.push(escapeHtml(lines[i] ?? ''))
        i += 1
      }
      if (i < lines.length) i += 1
      html.push(`<pre><code class="language-${lang}">${body.join('\n')}</code></pre>`)
      continue
    }
    if (/^#{1,4} /.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      html.push(`<h${level}>${inlineMarkdown(line.replace(/^#{1,4} /, ''))}</h${level}>`)
      i += 1
      continue
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^[-*] /, ''))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^\d+\. /, ''))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    if (line.trim().includes('|') && line.includes('|')) {
      const rows: string[][] = []
      while (i < lines.length && (lines[i] ?? '').includes('|')) {
        const raw = (lines[i] ?? '').trim()
        i += 1
        if (/^[\s|:.-]+$/.test(raw)) continue
        const cells = raw
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
        if (cells.some((cell) => cell.length > 0)) rows.push(cells)
      }
      if (rows.length > 0) {
        const head = rows[0] ?? []
        const body = rows.slice(1)
        html.push(
          `<table><thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body
            .map(
              (row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`
            )
            .join('')}</tbody></table>`
        )
      }
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^#{1,4} |^[-*] |^\d+\. |^```/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').includes('|')
    ) {
      para.push(lines[i] ?? '')
      i += 1
    }
    html.push(`<p>${inlineMarkdown(para.join('\n')).replace(/\n/g, '<br>')}</p>`)
  }
  return html.join('')
}
