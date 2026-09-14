import type { AssistantMessageBlock } from '../../types'

/** 提问选项。 */
export type QuestionOption = {
  /** 展示文案。 */
  label: string
  /** 说明。 */
  description?: string
}

/** 解析提问选项。 */
function parseOptions(raw: unknown): QuestionOption[] {
  /** 待处理的值。 */
  let value: unknown = raw
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  /** 可选参数。 */
  const options: QuestionOption[] = []
  /** 列表一项。 */
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    /** 展示文案。 */
    const label =
      typeof (item as { label?: unknown }).label === 'string'
        ? (item as { label: string }).label.trim()
        : ''
    if (!label) continue
    /** 说明。 */
    const description =
      typeof (item as { description?: unknown }).description === 'string'
        ? (item as { description: string }).description.trim()
        : ''
    options.push(description ? { label, description } : { label })
  }
  return options
}

/** 从助手块读提问。 */
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

/** 毫秒时间戳转时钟文案。 */
export function formatClock(value?: number) {
  if (!value) return ''
  /** 日期对象。 */
  const date = new Date(value)
  /** 小时。 */
  const hours = String(date.getHours()).padStart(2, '0')
  /** 分钟。 */
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
