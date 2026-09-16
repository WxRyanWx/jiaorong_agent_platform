/**
 * 脚手架对话组件的对外入口。
 * 给 demo-workbench 页面或其它应用 import 根组件与公开类型，避免深入内部路径。
 */

import './style.css'

export { default as JiaorongAgentChat } from './JiaorongAgentChat.vue'
export type { JiaorongAgentChatFeatures } from './lib/features'
export type { JiaorongSlashCommand } from './lib/slashCommands'
export type { JiaorongToolbarAction } from './lib/toolbar'
