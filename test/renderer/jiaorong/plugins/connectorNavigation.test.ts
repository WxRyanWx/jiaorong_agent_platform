import { describe, expect, it } from 'vitest'
import {
  resolveConnectorManageBack,
  resolveConnectorManageTarget
} from '../../../../src/jiaorong_src/plugins/navigation'

describe('plugin center connector navigation', () => {
  it('keeps manage pages inside the plugin center shell', () => {
    const current = { name: 'skills-connectors', path: '/skills/connectors' }

    expect(resolveConnectorManageTarget('ocr', current)).toEqual({
      name: 'skills-connector-ocr'
    })
    expect(resolveConnectorManageTarget('detail', current, 'com.deepchat.plugins.cua')).toEqual({
      name: 'skills-connector-detail',
      params: { pluginId: 'com.deepchat.plugins.cua' }
    })
    expect(
      resolveConnectorManageBack({
        name: 'skills-connector-detail',
        path: '/skills/connectors/com.deepchat.plugins.cua'
      })
    ).toEqual({ name: 'skills-connectors' })
  })

  it('keeps the original plugins hub flow outside the plugin center', () => {
    const current = { name: 'plugins', path: '/plugins' }

    expect(resolveConnectorManageTarget('ocr', current)).toEqual({
      name: 'plugins-builtin-ocr'
    })
    expect(resolveConnectorManageTarget('detail', current, 'com.deepchat.plugins.cua')).toEqual({
      name: 'plugins-detail',
      params: { pluginId: 'com.deepchat.plugins.cua' }
    })
    expect(
      resolveConnectorManageBack({
        name: 'plugins-detail',
        path: '/plugins/com.deepchat.plugins.cua'
      })
    ).toEqual({ name: 'plugins' })
  })
})
