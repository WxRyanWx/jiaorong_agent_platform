import os from 'node:os'
import path from 'node:path'

const MAX_SEGMENT_LENGTH = 80
const APP_HOME_DIR_NAME = '.jiaorongchat'

function getJiaorongConversationLogsRoot(homeDir: string = os.homedir()): string {
  try {
    return path.join(homeDir || os.homedir(), APP_HOME_DIR_NAME, 'logs')
  } catch {
    return path.join(os.tmpdir(), APP_HOME_DIR_NAME, 'logs')
  }
}

export function sanitizePathSegment(raw: unknown, fallback: string): string {
  try {
    const trimmed = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim()
    const cleaned = [...trimmed]
      .map((char) => {
        const code = char.charCodeAt(0)
        if (code < 32 || '<>:"/\\|?*'.includes(char)) {
          return '_'
        }
        return char
      })
      .join('')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
    const base = cleaned || fallback
    if (base.length <= MAX_SEGMENT_LENGTH) {
      return base
    }
    return base.slice(0, MAX_SEGMENT_LENGTH).replace(/[. ]+$/g, '') || fallback
  } catch {
    return fallback
  }
}

export function resolveConversationTimingDir(params: {
  agentName: unknown
  conversationTitle: unknown
  sessionId: unknown
  logsRoot?: string
}): string {
  try {
    const logsRoot = params.logsRoot ?? getJiaorongConversationLogsRoot()
    const agentSegment = sanitizePathSegment(params.agentName, 'unknown-agent')
    const titleSegment = sanitizePathSegment(params.conversationTitle, 'untitled')
    const sessionSegment = sanitizePathSegment(params.sessionId, 'session')
    return path.join(logsRoot, agentSegment, `${titleSegment}__${sessionSegment}`)
  } catch {
    return path.join(getJiaorongConversationLogsRoot(), 'unknown-agent', 'untitled__session')
  }
}
