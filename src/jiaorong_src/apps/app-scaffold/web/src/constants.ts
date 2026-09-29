/**
 * 脚手架业务常量。
 * 改应用 id、端口、对话文案只动这个文件；技能与系统提示词在 node/main.js 里。
 */

/** 应用 id，必须与 app.json 的 id 一致。 */
export const APP_ID = 'app-scaffold'

/** 包内 Node 的 WS 桥端口，与 main.ts 里 initRendererBridge 传的一致；客户端不探口。 */
export const NODE_PORT = 47821

/** 包内 Node 的 HTTP 端口，页面所有业务请求都打这里。 */
export const NODE_HTTP_PORT = 47822

/** 应用内智能体的稳定 key，与 node/main.js 的 AGENT_KEY 一致；重复 create 复用同一条。 */
export const CHAT_AGENT_KEY = 'workbench'

/** 侧栏和对话顶栏展示的智能体名称，与 node/main.js 的 AGENT_NAME 一致。 */
export const CHAT_AGENT_NAME = '示例应用助手'

/** 传给 JiaorongAgentChat 的 `/` 列表。skillDir 是 `skill/` 下目录名，不要写 app.{id}.{dir}。 */
export const CHAT_SLASH_ITEMS = [
  {
    category: 'skill' as const,
    skillDir: 'weekly-report',
    label: '周报整理',
    description: '把零散工作记录整理成周报。用户提到本周进展、周报、小结、汇报时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'meeting-minutes',
    label: '会议纪要',
    description: '把会议发言整理成纪要。用户提到开会、纪要、决议、待办、会议记录时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'contract-review',
    label: '合同审核',
    description: '按清单审核合同风险。用户提到合同、条款、违约、审核合同时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'data-query',
    label: '数据查询',
    description: '按用户问题查询业务数据。用户提到查数、报表、库存、订单量、统计时必须使用。'
  }
]

/** 传给 JiaorongAgentChat 的输入框占位文案。不传则组件用默认「向 xxx 发送消息…」。 */
export const CHAT_PLACEHOLDER = '请输入你的问题…例如「帮我写一份周报」'
