/**
 * 插件中心「连接器」隐藏名单。
 * 只藏 UI：条目仍在 DOM 里，用 CSS `display: none` 藏掉，不卸载、不改默认开关。
 * 例如 `builtin:ocr` 默认仍开启，聊天里继续可用。
 *
 * 连接器 id（PluginsCatalogPage data-plugin-id）：
 *   builtin:ocr
 *   official:com.deepchat.plugins.cua
 *   official:com.deepchat.plugins.feishu
 *   remote:telegram | remote:feishu | remote:qqbot | remote:discord | remote:weixin-ilink
 *
 * MCP 隐藏名单在 `./mcp/hidden.ts` 维护。
 */
import { PLUGIN_CENTER_HIDDEN_MCP_IDS } from './mcp/hidden'

export { PLUGIN_CENTER_HIDDEN_MCP_IDS }

export const PLUGIN_CENTER_HIDDEN_PLUGIN_IDS = [
  'builtin:ocr',
  'official:com.deepchat.plugins.cua',
  'remote:telegram',
  'remote:discord',
  'remote:qqbot'
  // 'remote:weixin-ilink'
] as const

/** 插件中心额外藏掉的控件（MCP 市场入口、总开关、企业身份、底栏数量等）。只藏 UI，不改默认开启。 */
export const PLUGIN_CENTER_HIDDEN_SELECTORS = [
  '[data-mcp-market-button]',
  '[data-mcp-master-switch]',
  '[data-mcp-enterprise-identity]',
  '[data-mcp-server-counts]',
  '[data-mcp-source="jiaorong-app"]'
] as const

const cssAttr = (value: string): string => JSON.stringify(value)

const HIDE_ROOT = '.plugin-center-page'

/** 生成仅作用于插件中心的隐藏样式 */
export function buildPluginCenterHideCss(
  pluginIds: readonly string[] = PLUGIN_CENTER_HIDDEN_PLUGIN_IDS,
  mcpIds: readonly string[] = PLUGIN_CENTER_HIDDEN_MCP_IDS,
  selectors: readonly string[] = PLUGIN_CENTER_HIDDEN_SELECTORS
): string {
  const pluginRules = pluginIds.map(
    (id) => `${HIDE_ROOT} [data-plugin-id=${cssAttr(id)}]{display:none!important}`
  )
  const mcpRules = mcpIds.map(
    (id) => `${HIDE_ROOT} [data-mcp-server=${cssAttr(id)}]{display:none!important}`
  )
  const selectorRules = selectors.map(
    (selector) => `${HIDE_ROOT} ${selector}{display:none!important}`
  )
  return [...pluginRules, ...mcpRules, ...selectorRules].join('')
}
