/**
 * 从助手 action 块里读出追问文案与选项。
 * 给 JiaorongAgentChat 向外抛 question 事件、追问面板渲染选项使用。
 */

import type { AssistantMessageBlock } from '../model/host'

/**
 * 追问选项。
 */
export type QuestionOption = {
  /** 选项展示文案，提交时也用它当 optionLabel。 */
  label: string
  /** 选项补充说明，可空。 */
  description?: string
}

/**
 * 把 extra.questionOptions 收成选项数组。
 * 兼容 JSON 字符串、纯字符串数组、{ label, description } 对象数组。
 */
function parseOptions(raw: unknown): QuestionOption[] {
  /** 可能仍是 JSON 字符串，解开后再当数组用。 */
  let value: unknown = raw
  // 超级智能体有时把选项序列化成 JSON 字符串，先解开
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value)
    } catch {
      // 不是合法 JSON，当作没有选项，避免整块追问挂掉
      return []
    }
  }
  // 解完仍不是数组：没有可点选项
  if (!Array.isArray(value)) return []
  /** 已规范化的选项，脏数据已丢掉。 */
  const options: QuestionOption[] = []
  for (const item of value) {
    // 纯字符串选项：只填 label
    if (typeof item === 'string' && item.trim()) {
      options.push({ label: item.trim() })
      continue
    }
    // 非对象或空值：跳过脏数据
    if (!item || typeof item !== 'object') continue
    /** 对象选项的展示文案。 */
    const label =
      typeof (item as { label?: unknown }).label === 'string'
        ? (item as { label: string }).label.trim()
        : ''
    // 没有 label 的对象无法提交，丢弃
    if (!label) continue
    /** 对象选项的补充说明，可空。 */
    const description =
      typeof (item as { description?: unknown }).description === 'string'
        ? (item as { description: string }).description.trim()
        : ''
    options.push(description ? { label, description } : { label })
  }
  return options
}

/**
 * 从助手块读出追问文案、选项与交互约束。
 * @param block 带 question_request 的助手块
 * @returns text 追问正文；options 可点选项；allowOther 是否允许自定义作答；multiple 是否多选
 */
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
