/** app.json 字段规则：创建校验与发布表单共用，不要求文件夹名等于 id。 */

/** 必填字段。 */
export const APP_MANIFEST_REQUIRED_FIELDS = ['id', 'name', 'version', 'entry'] as const

/** 当前客户端：侧栏菜单，或只在应用中心打开。 */
export const APP_MANIFEST_SLOTS = ['menu', 'app-center'] as const

/** 宽松 semver：三段数字 + 可选预发布 / 构建元数据。 */
export const APP_MANIFEST_SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/

/** 发布表单字段。 */
export type AppManifestFormFields = {
  id: string
  name: string
  version: string
  entry: string
  slot: string
  icon: string
  description: string
  spawn: string
}

/** 清单不合规原因。 */
export type ManifestIssue =
  | { kind: 'required'; fields: string[] }
  | { kind: 'slot' }
  | { kind: 'version' }

/**
 * 把未知值收成 trim 后的字符串。
 * @param value JSON 字段
 */
export function readManifestString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 校验清单字段。null 表示通过。
 * @param record app.json 对象或发布表单
 */
export function inspectManifestRecord(record: {
  id?: unknown
  name?: unknown
  version?: unknown
  entry?: unknown
  slot?: unknown
}): ManifestIssue | null {
  /** 缺失的必填字段。 */
  const missing = APP_MANIFEST_REQUIRED_FIELDS.filter(
    (key) => readManifestString(record[key]) === ''
  )
  if (missing.length > 0) return { kind: 'required', fields: [...missing] }
  /** 挂载位置。 */
  const slot = readManifestString(record.slot)
  if (!(APP_MANIFEST_SLOTS as readonly string[]).includes(slot)) return { kind: 'slot' }
  if (!APP_MANIFEST_SEMVER.test(readManifestString(record.version))) return { kind: 'version' }
  return null
}

/**
 * 主进程中文提示，与创建应用同一套话术。
 * @param issue 校验结果
 */
export function manifestIssueMessage(issue: ManifestIssue): string {
  if (issue.kind === 'required') return `app.json 缺少必填字段：${issue.fields.join('、')}`
  if (issue.kind === 'slot') return 'app.json 的 slot 必须是 menu 或 app-center'
  return 'app.json 的 version 要用三段式版本号，例如 1.0.0'
}

/**
 * 由表单字段拼出最终版 app.json 文本。
 * @param fields 发布表单
 */
export function buildManifestJson(fields: AppManifestFormFields): string {
  /** 必填字段始终写出。 */
  const record: Record<string, string> = {
    id: fields.id.trim(),
    name: fields.name.trim(),
    version: fields.version.trim(),
    entry: fields.entry.trim(),
    slot: fields.slot.trim()
  }
  /** 选填：空就不写进 JSON。 */
  const icon = fields.icon.trim()
  const description = fields.description.trim()
  const spawn = fields.spawn.trim()
  if (icon) record.icon = icon
  if (description) record.description = description
  if (spawn) record.spawn = spawn
  return JSON.stringify(record, null, 2)
}

/**
 * 空发布表单。
 */
export function emptyManifestForm(): AppManifestFormFields {
  return {
    id: '',
    name: '',
    version: '',
    entry: '',
    slot: 'app-center',
    icon: '',
    description: '',
    spawn: ''
  }
}

/**
 * 从 app.json 对象抽出表单字段。
 * @param record zip 内解析出的清单
 */
export function formFieldsFromRecord(record: Record<string, unknown>): AppManifestFormFields {
  /** 挂载位置，非法或未填时不钉到侧栏。 */
  const slot = readManifestString(record.slot) || 'app-center'
  return {
    id: readManifestString(record.id),
    name: readManifestString(record.name),
    version: readManifestString(record.version),
    entry: readManifestString(record.entry),
    slot: (APP_MANIFEST_SLOTS as readonly string[]).includes(slot) ? slot : 'app-center',
    icon: readManifestString(record.icon),
    description: readManifestString(record.description),
    spawn: readManifestString(record.spawn)
  }
}

/**
 * 把表单字段覆盖进原清单，保留未展示的额外字段。
 * @param original zip 内原对象
 * @param fields 确认后的表单
 */
export function overlayManifestRecord(
  original: Record<string, unknown>,
  fields: AppManifestFormFields
): Record<string, unknown> {
  /** 覆盖后的清单。 */
  const next: Record<string, unknown> = { ...original }
  next.id = fields.id.trim()
  next.name = fields.name.trim()
  next.version = fields.version.trim()
  next.entry = fields.entry.trim()
  next.slot = fields.slot.trim()
  const icon = fields.icon.trim()
  const description = fields.description.trim()
  const spawn = fields.spawn.trim()
  if (icon) next.icon = icon
  else delete next.icon
  if (description) next.description = description
  else delete next.description
  if (spawn) next.spawn = spawn
  else delete next.spawn
  return next
}
