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
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').slice(2))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(```|#|[-*] )/.test(lines[i] ?? '')) {
      para.push(lines[i] ?? '')
      i += 1
    }
    html.push(`<p>${inlineMarkdown(para.join('\n'))}</p>`)
  }
  return html.join('')
}
