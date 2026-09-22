/**
 * 包内 Node：普通 Elysia HTTP + 同一端口 WS。
 * 页面连上后，本进程发 {msgType:'request'} 调页面 jiaorong。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

const HOST = process.env.JIAORONG_NODE_HOST || '127.0.0.1'
const ROOT = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.JIAORONG_NODE_PORT || 8787)

const KNOWN = new Set([
  'context.get',
  'userinfo.get',
  'agent.create',
  'agent.update',
  'agent.get',
  'agent.list',
  'catalog.slash',
  'catalog.models',
  'catalog.systemPrompts',
  'catalog.agentTools',
  'knowledgeBase.query',
  'knowledgeBase.queryDirectory',
  'session.create',
  'session.list',
  'session.search',
  'session.get',
  'session.rename',
  'session.pin',
  'session.setModel',
  'session.setPermissionMode',
  'session.setOrchestrationPolicy',
  'session.getGenerationSettings',
  'session.updateGenerationSettings',
  'session.getContextOccupancy',
  'session.setToolMode',
  'session.getDisabledAgentTools',
  'session.updateDisabledAgentTools',
  'session.delete',
  'session.send',
  'session.retryMessage',
  'session.deleteMessage',
  'session.editUserMessage',
  'session.fork',
  'session.stop',
  'session.steer',
  'chat.respondToolInteraction',
  'dialog.selectDirectory',
  'dialog.selectFiles',
  'dialog.readFilePreview',
  'dialog.rememberDroppedFiles',
  'dialog.allowProjectDir',
  'clipboard.writeImage',
  'capture.pageArea',
  'devtools.open',
  'disconnect'
])

const SKILLS = ['weekly-report', 'meeting-minutes', 'contract-review', 'data-query']

function skillFile(appDir, skillDir) {
  const root = String(appDir || '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replaceAll('\\', '/')
  if (!root) return `skill/${skillDir}/SKILL.md`
  return `${root}/skill/${skillDir}/SKILL.md`
}

function buildPrompt(appDir) {
  const def = skillFile(appDir, 'weekly-report')
  const others = SKILLS.filter((name) => name !== 'weekly-report')
    .map((name) => `- ${skillFile(appDir, name)}`)
    .join('\n')
  return [
    '你是示例应用助手，用中文简洁回答。',
    '',
    '默认必须先用文件读取工具打开并严格遵循这份技能，再回答用户：',
    def,
    '',
    '仅当用户明确要求会议纪要、合同审核或数据查询时，再改读对应技能文件：',
    others
  ].join('\n')
}

function appId() {
  if (process.env.JIAORONG_APP_ID) return process.env.JIAORONG_APP_ID.trim()
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, '../app.json'), 'utf8'))
    if (typeof parsed.id === 'string' && parsed.id.trim()) return parsed.id.trim()
  } catch {
    /* ignore */
  }
  return 'app-scaffold'
}

let page = null
const pending = new Map()
const waiters = []

function send(ws, obj) {
  ws.send(JSON.stringify(obj))
}

function request(method, payload = []) {
  return new Promise((resolve, reject) => {
    const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const timer = setTimeout(() => {
      pending.delete(reqId)
      reject(Object.assign(new Error('页面未连接超级智能体桥'), { code: 'JIAORONG_NOT_RUNNING' }))
    }, 120_000)
    const run = (ws) => {
      pending.set(reqId, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
      send(ws, { msgType: 'request', reqId, method, payload })
    }
    if (page) run(page)
    else waiters.push(run)
  })
}

function pageMethod(path) {
  if (path === 'context.get') return 'jiaorong.getContext'
  if (path === 'userinfo.get') return 'jiaorong.userinfo'
  if (path === 'chat.respondToolInteraction') return 'jiaorong.respondToolInteraction'
  if (path === 'devtools.open') return 'jiaorong.openDevTools'
  return `jiaorong.${path}`
}

const sa = new Proxy(function () {}, {
  get(_t, key) {
    if (typeof key !== 'string' || key === 'then') return undefined
    const nest = (path) =>
      new Proxy(function () {}, {
        get(_i, next) {
          if (typeof next !== 'string' || next === 'then') return undefined
          return nest(`${path}.${next}`)
        },
        apply(_i, _this, args) {
          return request(pageMethod(path), [args[0] ?? {}])
        }
      })
    return nest(key)
  }
})

function onPageMessage(raw) {
  let msg
  try {
    msg = typeof raw === 'string' || raw instanceof Uint8Array ? JSON.parse(String(raw)) : raw
    if (typeof msg === 'string') msg = JSON.parse(msg)
  } catch {
    return
  }
  if (!msg || (msg.msgType !== 'response' && msg.msgType !== 'error')) return
  const waiter = pending.get(msg.reqId)
  pending.delete(msg.reqId)
  if (!waiter) return
  if (msg.msgType === 'response') waiter.resolve(msg.data !== undefined ? msg.data : msg.payload)
  else waiter.reject({ code: msg.code || 'CALL_ERROR', message: msg.message || '请求失败' })
}

function callSa(target, method, payload) {
  let cur = target
  for (const part of method.split('.')) cur = cur[part]
  return cur(payload)
}

async function invokeSuperAgent(method, args) {
  if (!KNOWN.has(method)) {
    const error = new Error(`Unknown method: ${method}`)
    error.code = 'VALIDATION_ERROR'
    throw error
  }
  if (method === 'disconnect') return { ok: true }
  let payload = args ?? {}
  if (method === 'agent.create' || method === 'agent.update') {
    const ctx = await sa.context.get({})
    const input = payload && typeof payload === 'object' ? payload : {}
    const legacyKey = typeof input.key === 'string' ? input.key.trim() : ''
    const agentKey =
      (typeof input.agentKey === 'string' && input.agentKey.trim()) || legacyKey || 'workbench'
    payload = {
      ...input,
      agentKey,
      key: legacyKey || agentKey,
      name:
        typeof input.name === 'string' && input.name.trim() ? input.name.trim() : '示例应用助手',
      skills: SKILLS,
      config: {
        ...(input.config && typeof input.config === 'object' ? input.config : {}),
        systemPrompt: buildPrompt(ctx?.appDir || '')
      }
    }
  }
  return callSa(sa, method, payload)
}

const app = new Elysia({ adapter: node() })
  .onRequest(({ set }) => {
    set.headers['Access-Control-Allow-Origin'] = '*'
    set.headers['Access-Control-Allow-Headers'] = 'content-type'
    set.headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS,GET'
  })
  .options('/rpc', () => '')
  .get('/api/health', () => ({
    ok: true,
    service: 'app-scaffold',
    appId: appId()
  }))
  .post('/rpc', async ({ body, set }) => {
    const method = body && typeof body === 'object' ? String(body.method || '') : ''
    const args = body && typeof body === 'object' ? body.args : {}
    try {
      const data = await invokeSuperAgent(method, args ?? {})
      if (data === undefined) {
        throw Object.assign(new Error(`${method} 无返回`), { code: 'GENERATION_FAILED' })
      }
      return { ok: true, data }
    } catch (error) {
      set.status = 400
      const rec = error && typeof error === 'object' ? error : {}
      const message =
        error instanceof Error
          ? error.message
          : typeof rec.message === 'string' && rec.message.trim()
            ? rec.message
            : String(error)
      return {
        ok: false,
        error: {
          code: typeof rec.code === 'string' ? rec.code : 'GENERATION_FAILED',
          message
        }
      }
    }
  })
  .ws('/', {
    open(ws) {
      page = ws
      waiters.splice(0).forEach((run) => run(ws))
    },
    message(_ws, message) {
      onPageMessage(message)
    },
    close(ws) {
      if (page === ws) page = null
    }
  })

app.listen({ hostname: HOST, port: PORT }, () => {
  console.log(`[app-scaffold] listening ${HOST}:${PORT}`)
})
