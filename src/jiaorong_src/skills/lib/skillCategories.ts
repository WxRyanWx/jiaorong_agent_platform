/**
 * 技能市场分类筛选（交融私有）。
 * 筛选栏固定 5 类 +「全部」；内置靠名称映射，远程靠 tagList。
 * 远程 tagList 可含多余标签；筛选只认下方 5 个固定分类名（需与接口文案完全一致）。
 */

export const SKILL_CATEGORY_ALL = '全部'

/** 固定筛选栏（含「全部」） */
export const SKILL_FILTER_CATEGORIES = [
  SKILL_CATEGORY_ALL,
  '综合办公',
  '软件研发',
  '工程建设',
  '合同法务',
  '经营投标'
] as const

export type SkillFilterCategory = (typeof SKILL_FILTER_CATEGORIES)[number]
export type SkillFilterCategoryTag = Exclude<SkillFilterCategory, typeof SKILL_CATEGORY_ALL>

const FILTER_CATEGORY_TAG_SET = new Set<string>(
  SKILL_FILTER_CATEGORIES.filter((item) => item !== SKILL_CATEGORY_ALL)
)

/**
 * 内置技能 → 所属分类（可多标签；无分类则不进映射，仅「全部」可见）。
 * 与产品提供的内置分类表对齐。
 */
export const BUILTIN_SKILL_CATEGORY_MAP: Readonly<
  Record<string, readonly SkillFilterCategoryTag[]>
> = {
  'algorithmic-art': ['软件研发'],
  'code-review': ['软件研发'],
  'frontend-design': ['软件研发'],
  'git-commit': ['软件研发'],
  'infographic-syntax-creator': ['软件研发'],
  'mcp-builder': ['软件研发'],
  'web-artifacts-builder': ['软件研发'],
  'doc-coauthoring': ['综合办公'],
  docx: ['综合办公'],
  pdf: ['综合办公'],
  pptx: ['综合办公'],
  xlsx: ['综合办公']
  // jiaorong-settings / skill-creator：无分类，仅「全部」
}

/** metadata 中存放远程标签的字段（与接口 tagList 对齐） */
export const METADATA_TAG_LIST_KEY = 'tagList'

/** 从远程/metadata 解析标签列表 */
export function parseSkillTagList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const tags: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const t = item.trim()
      if (t) tags.push(t)
      continue
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      for (const key of ['name', 'label', 'tag', 'tabName', 'tab'] as const) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) {
          tags.push(value.trim())
          break
        }
      }
    }
  }
  return Array.from(new Set(tags))
}

export function readTagListFromMetadata(
  metadata: Record<string, unknown> | undefined | null
): string[] {
  if (!metadata) return []
  return parseSkillTagList(metadata[METADATA_TAG_LIST_KEY])
}

/** 只保留固定 5 类中的标签，供筛选匹配 */
export function filterToKnownCategories(tags: string[]): SkillFilterCategoryTag[] {
  return tags.filter((tag): tag is SkillFilterCategoryTag => FILTER_CATEGORY_TAG_SET.has(tag))
}

/**
 * 技能用于筛选的标签集合（仅固定 5 类）：
 * 1. metadata.tagList（远程）中与固定分类重合的部分
 * 2. 否则内置名称映射
 * 3. 都没有 → 空（仅「全部」可见）
 */
export function getSkillFilterTags(skill: {
  name: string
  metadata?: Record<string, unknown> | null
}): string[] {
  const fromRemote = filterToKnownCategories(readTagListFromMetadata(skill.metadata ?? undefined))
  if (fromRemote.length > 0) {
    return fromRemote
  }
  const builtin = BUILTIN_SKILL_CATEGORY_MAP[skill.name]
  return builtin ? [...builtin] : []
}

export function skillMatchesCategoryFilter(
  skill: { name: string; metadata?: Record<string, unknown> | null },
  activeCategory: string
): boolean {
  if (!activeCategory || activeCategory === SKILL_CATEGORY_ALL) {
    return true
  }
  return getSkillFilterTags(skill).includes(activeCategory)
}
