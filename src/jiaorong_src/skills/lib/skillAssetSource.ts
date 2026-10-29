/**
 * 技能新旧来源标识：`open-platform` 是开放平台发布的新技能，
 * `legacy` 是旧技能市场迁入的存量技能。
 * 取值与市场列表项的 `source` 字段一致，但在 skills 侧独立定义，
 * 保证开放平台目录迁走后技能市场与详情页仍自洽。
 */
export type SkillAssetSource = 'open-platform' | 'legacy'

const SKILL_ASSET_SOURCES: readonly SkillAssetSource[] = ['open-platform', 'legacy']

/**
 * 校验任意来源值；非法或缺失一律返回空串。
 * 技能列表 / 详情接口的字段名是 `skillSource`，内部 metadata 仍存为 `source`。
 * @param value 接口字段或内部 metadata 字段的原始值
 */
export function readSkillAssetSourceValue(value: unknown): SkillAssetSource | '' {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim() as SkillAssetSource
  return SKILL_ASSET_SOURCES.includes(trimmed) ? trimmed : ''
}

/**
 * 从技能 metadata 里读来源标识（内部字段名为 `source`）。
 * @param metadata 技能 metadata（远程合并结果或 session 里存的副本）
 */
export function readSkillAssetSource(
  metadata?: Record<string, unknown> | null
): SkillAssetSource | '' {
  return readSkillAssetSourceValue(metadata?.source)
}
