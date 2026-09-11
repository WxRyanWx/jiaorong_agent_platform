import { describe, expect, it } from 'vitest'
import { PLUGIN_CENTER_NAV_WIDTH_CLASS } from '../../../../src/jiaorong_src/plugins/layout'
import {
  isSkillRouteLocation,
  SKILL_ROUTE_NAMES
} from '../../../../src/jiaorong_src/router/skills.meta'

describe('plugin center routes', () => {
  it('includes skills, connectors, mcp, and skill detail', () => {
    expect(SKILL_ROUTE_NAMES).toEqual([
      'skills',
      'skills-connectors',
      'skills-connector-ocr',
      'skills-connector-detail',
      'skills-mcp',
      'skills-detail'
    ])
  })

  it('treats plugin-center routes as exclusive chrome and leaves the host plugins hub alone', () => {
    expect(isSkillRouteLocation('skills', '/skills')).toBe(true)
    expect(isSkillRouteLocation('skills-connectors', '/skills/connectors')).toBe(true)
    expect(isSkillRouteLocation('skills-connector-detail', '/skills/connectors/foo')).toBe(true)
    expect(isSkillRouteLocation('skills-connector-ocr', '/skills/connectors/builtin/ocr')).toBe(
      true
    )
    expect(isSkillRouteLocation('plugins-detail', '/plugins/com.deepchat.plugins.cua')).toBe(false)
    expect(isSkillRouteLocation('chat', '/chat')).toBe(false)
  })

  it('keeps plugin-center nav the same width as the session column', () => {
    expect(PLUGIN_CENTER_NAV_WIDTH_CLASS).toBe('w-[240px]')
  })
})
