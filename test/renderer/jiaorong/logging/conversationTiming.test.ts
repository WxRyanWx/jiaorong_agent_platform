import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async () => {
  return await vi.importActual<typeof import('node:fs')>('node:fs')
})

import {
  resolveConversationTimingDir,
  sanitizePathSegment
} from '../../../../src/jiaorong_src/logging/conversationTiming/paths'
import {
  getModelTraceSessionId,
  isModelChatRequestUrl,
  readXTraceIdFromHeaders,
  resolveRequestUrl,
  runWithModelTraceSession
} from '../../../../src/jiaorong_src/logging/conversationTiming/modelTraceContext'
import {
  ConversationTimingTracker,
  formatLocalTimestamp
} from '../../../../src/jiaorong_src/logging/conversationTiming/tracker'

async function waitForLogFile(filePath: string, timeoutMs = 1000): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8').trim()
      if (content) return content
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timing log not written: ${filePath}`)
}

describe('jiaorong conversationTiming', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sanitizes unsafe path segments', () => {
    expect(sanitizePathSegment('a/b:c*d?', 'fallback')).toBe('a_b_c_d_')
    expect(sanitizePathSegment(null, 'fallback')).toBe('fallback')
    expect(sanitizePathSegment(undefined, 'fallback')).toBe('fallback')
  })

  it('formats timestamps in fixed Beijing time (UTC+8)', () => {
    expect(formatLocalTimestamp(Date.parse('2026-08-03T06:11:22.123Z'))).toBe(
      '2026-08-03 14:11:22.123'
    )
  })

  it('resolves agent/conversation directories under logs root', () => {
    const dir = resolveConversationTimingDir({
      agentName: 'JiaorongAI',
      conversationTitle: '单纯的执行一个复杂任务',
      sessionId: 'session-1',
      logsRoot: '/tmp/jiaorong-logs'
    })
    expect(dir).toBe(
      path.join('/tmp/jiaorong-logs', 'JiaorongAI', '单纯的执行一个复杂任务__session-1')
    )
  })

  it('writes flat timestamps without round arrays', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)

    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')
    tracker.beginTurn({
      sessionId: 's1',
      messageId: 'm1',
      agentName: 'JiaorongAI',
      conversationTitle: '你好',
      turnPrompt: '把主题改成深色',
      at: t0
    })
    tracker.observeStreamBlocks(
      's1',
      [{ type: 'reasoning', content: 'thinking...' }],
      'm1',
      t0 + 1000
    )
    tracker.markToolsStart('s1', t0 + 5000)
    tracker.markToolsEnd('s1', t0 + 5200)
    tracker.observeStreamBlocks(
      's1',
      [
        { type: 'reasoning', content: 'thinking...' },
        { type: 'tool_call', content: 'ok' }
      ],
      'm1',
      t0 + 5300
    )
    tracker.observeStreamBlocks(
      's1',
      [
        { type: 'reasoning', content: 'thinking...' },
        { type: 'content', content: '已切换' }
      ],
      'm1',
      t0 + 8200
    )
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '你好',
        sessionId: 's1',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    tracker.finishTurn('s1', 'completed', t0 + 20000, root)
    const parsed = JSON.parse(await waitForLogFile(filePath))

    expect(parsed.turnPrompt).toBe('把主题改成深色')
    expect(parsed.toolsStartAt).toBe(formatLocalTimestamp(t0 + 5000))
    expect(parsed.toolsEndAt).toBe(formatLocalTimestamp(t0 + 5200))
    expect(parsed.modelEndAt).toBe(parsed.turnEndAt)
    expect(parsed.modelInputAt).toBe(formatLocalTimestamp(t0))
    expect(parsed.modelFirstOutputAt).toBe(formatLocalTimestamp(t0 + 1000))
    expect(parsed.xTraceIds).toEqual([])
  })

  it('keeps first-model start and last-model end across two tool gaps', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')

    tracker.beginTurn({
      sessionId: 's2',
      messageId: 'm2',
      agentName: 'JiaorongAI',
      conversationTitle: '你好',
      turnPrompt: '复杂任务',
      at: t0
    })
    tracker.observeStreamBlocks('s2', [{ type: 'content', content: 'a' }], 'm2', t0 + 1000)
    tracker.markToolsStart('s2', t0 + 2000)
    tracker.markToolsEnd('s2', t0 + 2100)
    tracker.observeStreamBlocks(
      's2',
      [
        { type: 'content', content: 'a' },
        { type: 'content', content: 'b' }
      ],
      'm2',
      t0 + 5000
    )
    tracker.markToolsStart('s2', t0 + 8000)
    tracker.markToolsEnd('s2', t0 + 8200)
    tracker.observeStreamBlocks(
      's2',
      [
        { type: 'content', content: 'a' },
        { type: 'content', content: 'b' },
        { type: 'content', content: 'c' }
      ],
      'm2',
      t0 + 12000
    )
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '你好',
        sessionId: 's2',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    tracker.finishTurn('s2', 'completed', t0 + 15000, root)
    const parsed = JSON.parse(await waitForLogFile(filePath))

    expect(parsed.modelInputAt).toBe(formatLocalTimestamp(t0))
    expect(parsed.modelFirstOutputAt).toBe(formatLocalTimestamp(t0 + 1000))
    expect(parsed.toolsStartAt).toBe(formatLocalTimestamp(t0 + 2000))
    expect(parsed.toolsEndAt).toBe(formatLocalTimestamp(t0 + 8200))
    expect(parsed.modelEndAt).toBe(formatLocalTimestamp(t0 + 15000))
    expect(parsed.turnEndAt).toBe(formatLocalTimestamp(t0 + 15000))
  })

  it('swallows tracker errors without throwing to caller', () => {
    const tracker = new ConversationTimingTracker()
    expect(() =>
      tracker.beginTurn({
        sessionId: '',
        turnPrompt: 'x'
      })
    ).not.toThrow()
    expect(() => tracker.observeStreamBlocks('missing', null)).not.toThrow()
    expect(() => tracker.markToolsStart('missing')).not.toThrow()
    expect(() => tracker.markToolsEnd('missing')).not.toThrow()
    expect(() => tracker.finishTurn('missing', 'completed')).not.toThrow()
  })

  it('ignores rate-limit / empty narrative as model first output', async () => {
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')
    tracker.beginTurn({
      sessionId: 's3',
      messageId: 'm3',
      turnPrompt: 'hello',
      at: t0,
      logsRoot: undefined
    })
    tracker.observeStreamBlocks(
      's3',
      [{ type: 'action', action_type: 'rate_limit', content: '' }],
      '__rate_limit__:run-1',
      t0 + 100
    )
    tracker.observeStreamBlocks('s3', [], '__rate_limit__:run-1', t0 + 200)

    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'deepchat',
        conversationTitle: 'hello',
        sessionId: 's3',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    tracker.observeStreamBlocks('s3', [{ type: 'content', content: 'hi' }], 'm3', t0 + 5000)
    tracker.finishTurn('s3', 'completed', t0 + 6000, root)

    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.modelFirstOutputAt).toBe(formatLocalTimestamp(t0 + 5000))
    expect(parsed.messageId).toBe('m3')
  })

  it('keeps assistant messageId when late enrich runs', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    tracker.beginTurn({
      sessionId: 's7',
      messageId: 'user-1',
      turnPrompt: 'q',
      logsRoot: root
    })
    tracker.beginTurn({
      sessionId: 's7',
      messageId: 'assistant-1'
    })
    tracker.enrichActiveTurn({
      sessionId: 's7',
      agentName: 'JiaorongAI',
      conversationTitle: '侧栏'
    })
    tracker.observeStreamBlocks('s7', [{ type: 'content', content: 'a' }], 'assistant-1')
    tracker.finishTurn('s7', 'completed')
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '侧栏',
        sessionId: 's7',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.messageId).toBe('assistant-1')
    expect(parsed.agentName).toBe('JiaorongAI')
  })

  it('does not reset narrative baseline on empty snapshot while awaiting next model', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')
    tracker.beginTurn({
      sessionId: 's8',
      turnPrompt: 'q',
      conversationTitle: 't',
      agentName: 'JiaorongAI',
      at: t0,
      logsRoot: root
    })
    tracker.observeStreamBlocks('s8', [{ type: 'content', content: 'abcd' }], 'a1', t0 + 1000)
    tracker.markToolsStart('s8', t0 + 2000)
    tracker.markToolsEnd('s8', t0 + 2100)
    // empty clear snapshot must not collapse baseline to 0
    tracker.observeStreamBlocks('s8', [], '__rate_limit__:x', t0 + 2200)
    // same narrative → still waiting
    tracker.observeStreamBlocks('s8', [{ type: 'content', content: 'abcd' }], 'a1', t0 + 2300)
    // real growth → next model
    tracker.observeStreamBlocks(
      's8',
      [
        { type: 'content', content: 'abcd' },
        { type: 'content', content: 'e' }
      ],
      'a1',
      t0 + 5000
    )
    tracker.finishTurn('s8', 'completed', t0 + 6000)
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: 't',
        sessionId: 's8',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.toolsStartAt).toBe(formatLocalTimestamp(t0 + 2000))
    expect(parsed.modelEndAt).toBe(formatLocalTimestamp(t0 + 6000))
  })

  it('does not create ghost turn after finish when enriching', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    tracker.beginTurn({
      sessionId: 's4',
      turnPrompt: 'q1',
      agentName: 'id-1',
      logsRoot: root
    })
    tracker.finishTurn('s4', 'completed')
    expect(tracker.hasActiveTurn('s4')).toBe(false)

    tracker.enrichActiveTurn({
      sessionId: 's4',
      agentName: 'JiaorongAI',
      conversationTitle: '侧栏标题'
    })
    expect(tracker.hasActiveTurn('s4')).toBe(false)
  })

  it('keeps turnPrompt when SessionStart resumes with empty prompt', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')

    tracker.beginTurn({
      sessionId: 's5',
      turnPrompt: '原始问题',
      conversationTitle: '原始问题',
      forceNewTurn: true,
      at: t0,
      logsRoot: root
    })
    tracker.observeStreamBlocks('s5', [{ type: 'content', content: 'a' }], 'm5', t0 + 1000)
    // simulate paused resume SessionStart (empty prompt)
    tracker.beginTurn({
      sessionId: 's5',
      messageId: 'assistant-1',
      forceNewTurn: false,
      at: t0 + 5000
    })
    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'deepchat',
        conversationTitle: '原始问题',
        sessionId: 's5',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    tracker.finishTurn('s5', 'completed', t0 + 8000)
    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.turnPrompt).toBe('原始问题')
  })

  it('interrupts stale running turn when a new user prompt arrives', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')

    tracker.beginTurn({
      sessionId: 's6',
      agentName: 'JiaorongAI',
      turnPrompt: '第一问',
      conversationTitle: '会话',
      forceNewTurn: true,
      at: t0,
      logsRoot: root
    })
    tracker.observeStreamBlocks('s6', [{ type: 'content', content: 'a' }], 'm6', t0 + 1000)

    tracker.beginTurn({
      sessionId: 's6',
      agentName: 'JiaorongAI',
      turnPrompt: '第二问',
      conversationTitle: '会话',
      forceNewTurn: true,
      at: t0 + 9000,
      logsRoot: root
    })
    tracker.observeStreamBlocks('s6', [{ type: 'content', content: 'b' }], 'm7', t0 + 10000)
    tracker.finishTurn('s6', 'completed', t0 + 11000)

    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '会话',
        sessionId: 's6',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    const content = await waitForLogFile(filePath)
    let lines = content.split('\n').filter(Boolean)
    const started = Date.now()
    while (lines.length < 2 && Date.now() - started < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (existsSync(filePath)) {
        lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean)
      }
    }
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const first = JSON.parse(lines[0])
    const last = JSON.parse(lines[lines.length - 1])
    expect(first.status).toBe('interrupted')
    expect(first.turnPrompt).toBe('第一问')
    expect(last.turnPrompt).toBe('第二问')
    expect(last.status).toBe('completed')
  })

  it('preserves enriched agentName and assistant messageId across SessionStart merge', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()

    tracker.beginTurn({
      sessionId: 's9',
      messageId: 'user-9',
      agentId: 'agent-uuid',
      agentName: 'agent-uuid',
      turnPrompt: '你好',
      forceNewTurn: true,
      logsRoot: root
    })
    tracker.enrichActiveTurn({
      sessionId: 's9',
      agentName: 'JiaorongAI',
      conversationTitle: '侧栏标题'
    })

    tracker.beginTurn({
      sessionId: 's9',
      messageId: 'assistant-9',
      agentId: 'agent-uuid',
      agentName: 'agent-uuid',
      forceNewTurn: false
    })

    tracker.beginTurn({
      sessionId: 's9',
      messageId: 'user-9b',
      agentId: 'agent-uuid',
      agentName: 'agent-uuid',
      turnPrompt: '你好',
      forceNewTurn: true
    })

    tracker.observeStreamBlocks('s9', [{ type: 'content', content: 'ok' }], 'assistant-9')
    tracker.finishTurn('s9', 'completed')

    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '侧栏标题',
        sessionId: 's9',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.agentName).toBe('JiaorongAI')
    expect(parsed.messageId).toBe('assistant-9')
    expect(parsed.conversationTitle).toBe('侧栏标题')
    expect(parsed.turnPrompt).toBe('你好')
  })

  it('simulates real hook order: UPS → SessionStart → stream → tools → completed → Stop', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')

    tracker.beginTurn({
      sessionId: 's10',
      messageId: 'user-10',
      agentId: 'aid',
      agentName: 'aid',
      turnPrompt: '执行任务',
      forceNewTurn: true,
      at: t0,
      logsRoot: root
    })
    tracker.beginTurn({
      sessionId: 's10',
      messageId: 'asst-10',
      agentId: 'aid',
      agentName: 'aid',
      turnPrompt: '执行任务',
      forceNewTurn: false,
      at: t0 + 10
    })
    tracker.enrichActiveTurn({
      sessionId: 's10',
      agentName: 'JiaorongAI',
      conversationTitle: '任务会话'
    })

    tracker.observeStreamBlocks(
      's10',
      [{ type: 'action', action_type: 'rate_limit', content: '' }],
      '__rate_limit__:run',
      t0 + 50
    )
    tracker.observeStreamBlocks(
      's10',
      [{ type: 'reasoning', content: 'think' }],
      'asst-10',
      t0 + 1000
    )
    tracker.markToolsStart('s10', t0 + 2000)
    tracker.markToolsEnd('s10', t0 + 2500)
    tracker.observeStreamBlocks(
      's10',
      [
        { type: 'reasoning', content: 'think' },
        { type: 'content', content: 'done' }
      ],
      'asst-10',
      t0 + 5000
    )

    tracker.finishTurn('s10', 'completed', t0 + 6000)
    expect(tracker.hasActiveTurn('s10')).toBe(false)
    tracker.finishTurn('s10', 'stopped', t0 + 6001)
    tracker.finishTurn('s10', 'ended', t0 + 6002)

    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: '任务会话',
        sessionId: 's10',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    const content = await waitForLogFile(filePath)
    const lines = content.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.status).toBe('completed')
    expect(parsed.messageId).toBe('asst-10')
    expect(parsed.agentName).toBe('JiaorongAI')
    expect(parsed.modelFirstOutputAt).toBe(formatLocalTimestamp(t0 + 1000))
    expect(parsed.toolsStartAt).toBe(formatLocalTimestamp(t0 + 2000))
    expect(parsed.toolsEndAt).toBe(formatLocalTimestamp(t0 + 2500))
    expect(parsed.modelEndAt).toBe(formatLocalTimestamp(t0 + 6000))
  })

  it('records x-trace-id list into timing.jsonl in request order', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jiaorong-timing-'))
    tempRoots.push(root)
    const tracker = new ConversationTimingTracker()
    const t0 = Date.parse('2026-08-03T03:36:00.000Z')

    tracker.beginTurn({
      sessionId: 's-trace',
      messageId: 'm-trace',
      agentName: 'JiaorongAI',
      conversationTitle: 'trace',
      turnPrompt: '查一下',
      at: t0,
      logsRoot: root
    })
    tracker.recordXTraceId('s-trace', '5342f73778cda6d34e1e89555269ba4f')
    tracker.recordXTraceId('s-trace', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    tracker.recordXTraceId('missing', 'should-ignore')
    tracker.recordXTraceId('s-trace', '  ')
    tracker.observeStreamBlocks(
      's-trace',
      [{ type: 'content', content: 'ok' }],
      'm-trace',
      t0 + 100
    )

    const filePath = path.join(
      resolveConversationTimingDir({
        agentName: 'JiaorongAI',
        conversationTitle: 'trace',
        sessionId: 's-trace',
        logsRoot: root
      }),
      'timing.jsonl'
    )
    tracker.finishTurn('s-trace', 'completed', t0 + 200, root)
    const parsed = JSON.parse(await waitForLogFile(filePath))
    expect(parsed.xTraceIds).toEqual([
      '5342f73778cda6d34e1e89555269ba4f',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ])
  })

  it('matches only model chat URLs and reads x-trace-id case-insensitively', () => {
    expect(isModelChatRequestUrl('https://c4ai.ccccltd.cn/api/compatible/v1/messages')).toBe(true)
    expect(
      isModelChatRequestUrl('https://c4ai.ccccltd.cn/api/compatible/v1/chat/completions?x=1')
    ).toBe(true)
    expect(isModelChatRequestUrl('https://example.com/v1/responses')).toBe(true)
    expect(isModelChatRequestUrl('https://example.com/v1/embeddings')).toBe(false)
    expect(isModelChatRequestUrl('https://example.com/v1/models')).toBe(false)
    expect(resolveRequestUrl('https://example.com/v1/messages')).toBe(
      'https://example.com/v1/messages'
    )

    const headers = new Headers({ 'X-Trace-Id': 'abc123' })
    expect(readXTraceIdFromHeaders(headers)).toBe('abc123')
    expect(readXTraceIdFromHeaders(new Headers())).toBeNull()
  })

  it('keeps ALS session binding for async model fetch context', async () => {
    expect(getModelTraceSessionId()).toBeNull()
    const seen = await runWithModelTraceSession('session-als', async () => {
      await Promise.resolve()
      return getModelTraceSessionId()
    })
    expect(seen).toBe('session-als')
    expect(getModelTraceSessionId()).toBeNull()
  })
})
