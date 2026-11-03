/**
 * 插件中心「连接器」隐藏名单。
 * 只藏 UI：条目仍在 DOM 里，用 CSS `display: none` 藏掉，不卸载、不改默认开关。
 * 例如 `builtin:ocr` 默认仍开启，聊天里继续可用。
 *
 * 插件中心里被隐藏的 IM 条目 id（PluginsCatalogPage data-plugin-id）：
 *   builtin:ocr
 *   official:com.deepchat.plugins.cua
 *   remote:telegram | remote:discord | remote:qqbot
 * 其余官方插件与远程渠道正常展示。
 *
 * MCP 隐藏名单在 `./mcp/hidden.ts` 维护。
 */
import { PLUGIN_CENTER_HIDDEN_MCP_IDS } from './mcp/hidden'
import { JIAORONG_APP_MCP_SOURCE } from '@shared/mcp/ownedBy'

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

const HIDDEN_PLUGIN_ID_SET = new Set<string>(PLUGIN_CENTER_HIDDEN_PLUGIN_IDS)
const HIDDEN_MCP_ID_SET = new Set<string>(PLUGIN_CENTER_HIDDEN_MCP_IDS)

/**
 * 插件中心里被 CSS 藏掉的 IM 条目。
 * 筛选与空态判断必须同步排除，否则会把「全部被隐藏」误判成有数据而出现白屏。
 */
export const isPluginCenterHiddenPluginId = (id: string): boolean => HIDDEN_PLUGIN_ID_SET.has(id)

/** 插件中心里被 CSS 藏掉的连接器条目（含交融子应用托管的 MCP）。 */
export const isPluginCenterHiddenMcpServer = (name: string, source?: string): boolean =>
  source === JIAORONG_APP_MCP_SOURCE || HIDDEN_MCP_ID_SET.has(name)

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
