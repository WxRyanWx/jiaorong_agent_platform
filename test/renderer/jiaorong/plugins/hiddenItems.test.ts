import { describe, expect, it } from 'vitest'
import {
  PLUGIN_CENTER_HIDDEN_MCP_IDS,
  PLUGIN_CENTER_HIDDEN_PLUGIN_IDS,
  buildPluginCenterHideCss
} from '../../../../src/jiaorong_src/plugins/hiddenItems'

describe('plugin center hide css', () => {
  it('scopes hidden plugin and mcp ids to the plugin center root', () => {
    const css = buildPluginCenterHideCss(['remote:telegram'], ['nowledge-mem'])

    expect(css).toContain(
      '.plugin-center-page [data-plugin-id="remote:telegram"]{display:none!important}'
    )
    expect(css).toContain(
      '.plugin-center-page [data-mcp-server="nowledge-mem"]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-market-button]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-master-switch]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-enterprise-identity]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-server-counts]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-source="jiaorong-app"]{display:none!important}'
    )
    expect(css).not.toContain('[data-plugin-id="builtin:ocr"]')
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-plugin-id="builtin:ocr"]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-plugin-id="official:com.deepchat.plugins.cua"]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-server="jiaorong-knowledge-base"]{display:none!important}'
    )
    expect(buildPluginCenterHideCss()).toContain(
      '.plugin-center-page [data-mcp-server="builtinKnowledge"]{display:none!important}'
    )
  })

  it('keeps the default hide lists non-empty for connectors and mcp', () => {
    expect(PLUGIN_CENTER_HIDDEN_PLUGIN_IDS.length).toBeGreaterThan(0)
    expect(PLUGIN_CENTER_HIDDEN_MCP_IDS.length).toBeGreaterThan(0)
    expect(buildPluginCenterHideCss()).toContain('data-plugin-id')
    expect(buildPluginCenterHideCss()).toContain('data-mcp-server')
  })
})
