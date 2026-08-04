import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveConversationTimingDir } from './paths'
import type { ConversationTurnTimingRecord } from './types'

function safeWarn(message: string, error?: unknown): void {
  try {
    console.warn(message, error)
  } catch {
    // ignore
  }
}

/** 同一文件串行追加，避免并发 append 乱序/交叉写坏 JSONL */
const writeTailByFile = new Map<string, Promise<void>>()

function enqueueAppend(filePath: string, line: string): void {
  const previous = writeTailByFile.get(filePath) ?? Promise.resolve()
  const next = previous
    .catch(() => {
      // 前一次失败不影响后续排队
    })
    .then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.appendFile(filePath, line, 'utf8')
    })
    .catch((error) => {
      safeWarn('[jiaorong/conversationTiming] failed to append timing log:', error)
    })
    .finally(() => {
      if (writeTailByFile.get(filePath) === next) {
        writeTailByFile.delete(filePath)
      }
    })

  writeTailByFile.set(filePath, next)
}

/** 异步追加 timing 日志。失败只 warn，绝不抛到调用方。 */
export function appendConversationTurnTiming(
  record: ConversationTurnTimingRecord,
  logsRoot?: string
): void {
  try {
    const dir = resolveConversationTimingDir({
      agentName: record.agentName,
      conversationTitle: record.conversationTitle,
      sessionId: record.sessionId,
      logsRoot
    })
    const filePath = path.join(dir, 'timing.jsonl')
    const line = `${JSON.stringify(record)}\n`
    enqueueAppend(filePath, line)
  } catch (error) {
    safeWarn('[jiaorong/conversationTiming] failed to schedule timing log:', error)
  }
}
