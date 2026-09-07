import type { AssistantMessageBlock } from '../../types'

export type QuestionOption = {
  label: string
  description?: string
}

function parseOptions(raw: unknown): QuestionOption[] {
  let value: unknown = raw
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const options: QuestionOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const label =
      typeof (item as { label?: unknown }).label === 'string'
        ? (item as { label: string }).label.trim()
        : ''
    if (!label) continue
    const description =
      typeof (item as { description?: unknown }).description === 'string'
        ? (item as { description: string }).description.trim()
        : ''
    options.push(description ? { label, description } : { label })
  }
  return options
}

export function readQuestion(block: AssistantMessageBlock) {
  return {
    text:
      (typeof block.extra?.questionText === 'string' && block.extra.questionText.trim()) ||
      block.content ||
      '请选择一项',
    options: parseOptions(block.extra?.questionOptions),
    allowOther: block.extra?.questionCustom !== false,
    multiple: block.extra?.questionMultiple === true
  }
}

export function formatClock(value?: number) {
  if (!value) return ''
  const date = new Date(value)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
