/**
 * 在私有 finalize 阶段把宿主拼进来的英文系统段改写成中文。
 * 不改开源主线程拼装代码：宿主仍产出英文段，此处按「已知英文标题」定点替换。
 *
 * 注意：不能整篇按 ## 切开——已固定技能的 SKILL.md 正文里也有 ##，会误伤。
 * 也不使用带 m 的 $ 锚点（会在每一行行尾误匹配）。
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceKnownPhrases(body: string, pairs: Array<[RegExp, string]>): string {
  let next = body
  for (const [pattern, replacement] of pairs) {
    next = next.replace(pattern, replacement)
  }
  return next
}

function localizeRuntimeBody(body: string): string {
  return replaceKnownPhrases(body, [
    [
      /- YoBrowser tools are available for browser automation when needed\. For web search, prefer China-accessible engines \(Baidu, 360 Search, Sogou\); do not default to Google unless the user explicitly asks or the target page is on a Google domain\./g,
      '- 需要浏览器自动化时使用 YoBrowser。网页搜索优先用国内可访问引擎（百度、360、搜狗）；除非用户明确要求或目标页在 Google 域名，否则不要默认用 Google。'
    ],
    [
      /- Use exec\(background: true\) to explicitly detach long-running terminal commands; foreground exec may also return a running session after its yield window\./g,
      '- 长耗时终端命令用 exec(background: true) 显式挂后台；前台 exec 在 yield 窗口后也可能返回仍在运行的会话。'
    ],
    [
      /- Use process\(list\|poll\|log\|write\|kill\|remove\) to manage background terminal sessions\./g,
      '- 用 process(list|poll|log|write|kill|remove) 管理后台终端会话。'
    ],
    [
      /- Before launching another long-running command, prefer process action "list" to inspect existing sessions\./g,
      '- 再启动长耗时命令前，优先用 process action "list" 查看已有会话。'
    ]
  ])
}

function localizePermissionBody(body: string): string {
  return replaceKnownPhrases(body, [
    [
      /Read-only Agent tools may be batched in parallel when useful: ([^.]+)\./g,
      '只读 Agent 工具可按需并行批量调用：$1。'
    ],
    [
      /Mutating and runtime tools stay serialized or permission-gated: ([^.]+)\./g,
      '会改动系统状态或运行时的工具须串行或走权限门控：$1。'
    ],
    [
      /Do not assume approval for file writes or commands when the session asks for it\./g,
      '会话要求确认时，不要擅自假设已获准写文件或执行命令。'
    ]
  ])
}

function localizeVerificationBody(body: string): string {
  return replaceKnownPhrases(body, [
    [
      /After changing code, configuration, tests, docs that affect behavior, or generated assets, check verification status before the final response\./g,
      '修改会影响行为的代码、配置、测试、文档或生成物后，最终回复前须核对验证状态。'
    ],
    [
      /If verification was not run, state the reason explicitly in the final response\./g,
      '若未跑验证，须在最终回复中明确说明原因。'
    ],
    [
      /In the JiaorongAI repository, prioritize `pnpm run format`, `pnpm run i18n`, and `pnpm run lint` after feature work\./g,
      '在 JiaorongAI 仓库中，功能改动后优先执行 `pnpm run format`、`pnpm run i18n`、`pnpm run lint`。'
    ],
    [
      /When relevant, prefer project-local verification scripts such as ([^.]+)\./g,
      '相关时优先使用项目本地验证脚本，例如 $1。'
    ]
  ])
}

function localizeFilesystemToolsBody(body: string): string {
  return replaceKnownPhrases(body, [
    [/Use canonical Agent tool names only: ([^.]+)\./g, '仅使用规范 Agent 工具名：$1。'],
    [
      /Legacy or disabled Agent tool names are not available\./g,
      '已废弃或未启用的 Agent 工具名不可用。'
    ]
  ])
}

type LocalizeRule = {
  enTitle: string
  zhTitle: string
  localizeBody?: (body: string) => string
}

const HOST_SECTION_RULES: LocalizeRule[] = [
  {
    enTitle: 'Runtime Capabilities',
    zhTitle: '运行时能力',
    localizeBody: localizeRuntimeBody
  },
  {
    enTitle: 'Permission Rules',
    zhTitle: '权限规则',
    localizeBody: localizePermissionBody
  },
  {
    enTitle: 'Verification Policy',
    zhTitle: '验证策略',
    localizeBody: localizeVerificationBody
  },
  {
    enTitle: 'File and Command Tools',
    zhTitle: '文件与命令工具',
    localizeBody: localizeFilesystemToolsBody
  },
  {
    enTitle: 'Tape Handoff State',
    zhTitle: '会话交接状态'
  }
]

/** 仅替换已知宿主英文 ## 段；不动技能正文里的其它 ## */
export function localizeHostSystemPromptSections(prompt: string): string {
  let next = prompt.replace(/\r\n/g, '\n')
  for (const rule of HOST_SECTION_RULES) {
    // 不用 m+$：带 m 时 $ 会匹配每一行行尾，正文会被截断
    // 下一段以 \n## 开始，或已到字符串末尾
    const pattern = new RegExp(
      `(^|\\n)## ${escapeRegExp(rule.enTitle)}\\n([\\s\\S]*?)(?=\\n## |$)`,
      'g'
    )
    next = next.replace(pattern, (_match, prefix: string, body: string) => {
      const localizedBody = rule.localizeBody ? rule.localizeBody(body) : body
      const trimmedBody = localizedBody.replace(/^\n+/, '').replace(/\n+$/, '')
      const section = trimmedBody ? `## ${rule.zhTitle}\n${trimmedBody}` : `## ${rule.zhTitle}`
      return `${prefix}${section}`
    })
  }
  return next.trimEnd()
}
