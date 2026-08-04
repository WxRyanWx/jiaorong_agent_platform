/**
 * 技能市场分类筛选（交融私有）。
 * 筛选栏：「全部」本地前置 + deepchat-ext/skillCategory/list。
 * 匹配：技能 metadata.categoryId（或内置名→id 映射）=== 选中分类 id。
 */

export const SKILL_CATEGORY_ALL = '全部'
/** 「全部」筛选项的稳定 id（非后端 id） */
export const SKILL_CATEGORY_ALL_ID = ''

export type SkillCategory = {
  id: string
  categoryName: string
}

/**
 * 内置技能 → 分类 id（与 skillCategory/list 的 id 对齐；无映射则仅「全部」可见）。
 */
export const BUILTIN_SKILL_CATEGORY_ID_MAP: Readonly<Record<string, string>> = {
  'algorithmic-art': 'rd',
  'code-review': 'rd',
  'frontend-design': 'rd',
  'git-commit': 'rd',
  'infographic-syntax-creator': 'rd',
  'mcp-builder': 'rd',
  'web-artifacts-builder': 'rd',
  'doc-coauthoring': 'office',
  docx: 'office',
  pdf: 'office',
  pptx: 'office',
  xlsx: 'office'
  // jiaorong-settings / skill-creator：无分类
}

/** metadata 中的远程分类 id */
export const METADATA_CATEGORY_ID_KEY = 'categoryId'

/** 解析技能列表上的 categoryId 字段（字符串；其它类型忽略） */
export function parseCategoryId(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return ''
}

export function readCategoryIdFromMetadata(
  metadata: Record<string, unknown> | undefined | null
): string {
  if (!metadata) return ''
  return parseCategoryId(metadata[METADATA_CATEGORY_ID_KEY])
}

/**
 * 解析 skillCategory/list 的 data。
 * 真实形态：`{ id, categoryName, createTime, updateTime }[]`
 */
export function parseSkillCategories(raw: unknown): SkillCategory[] {
  if (!Array.isArray(raw)) return []
  const categories: SkillCategory[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (typeof item === 'string') {
      // 无 id 的纯文案无法做 categoryId 匹配，跳过
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const categoryName =
      (typeof record.categoryName === 'string' && record.categoryName.trim()) || ''
    if (!id || !categoryName || seen.has(id)) continue
    seen.add(id)
    categories.push({ id, categoryName })
  }

  return categories
}

/** 「全部」+ 接口分类（保序、按 id 去重） */
export function buildFilterCategoryTabs(apiCategories: readonly SkillCategory[]): SkillCategory[] {
  const rest: SkillCategory[] = []
  const seen = new Set<string>()
  for (const item of apiCategories) {
    const id = item.id.trim()
    const categoryName = item.categoryName.trim()
    if (!id || !categoryName || id === SKILL_CATEGORY_ALL_ID || seen.has(id)) continue
    seen.add(id)
    rest.push({ id, categoryName })
  }
  return [{ id: SKILL_CATEGORY_ALL_ID, categoryName: SKILL_CATEGORY_ALL }, ...rest]
}

/** 技能用于筛选的分类 id：优先远程 categoryId，否则内置映射 */
export function getSkillCategoryId(skill: {
  name: string
  metadata?: Record<string, unknown> | null
}): string {
  const fromRemote = readCategoryIdFromMetadata(skill.metadata ?? undefined)
  if (fromRemote) return fromRemote
  return BUILTIN_SKILL_CATEGORY_ID_MAP[skill.name] || ''
}

export function skillMatchesCategoryFilter(
  skill: { name: string; metadata?: Record<string, unknown> | null },
  activeCategoryId: string
): boolean {
  if (!activeCategoryId || activeCategoryId === SKILL_CATEGORY_ALL_ID) {
    return true
  }
  return getSkillCategoryId(skill) === activeCategoryId
}
