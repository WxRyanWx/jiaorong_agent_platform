import { describe, expect, it, vi } from 'vitest'
import { materializeGuestFiles } from '../../../src/jiaorong_src/appHost/main/guest'
import {
  normalizeMessageFile,
  parseUserMessage
} from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/hostParse'
import { pendingToMessageFile } from '../../../src/jiaorong_src/apps/app-scaffold/web/src/components/jiaorongagentchat/lib/messageFiles'

describe('jiaorong guest attachments', () => {
  it('writes temp files and prepareFile like the official chat pipeline', async () => {
    const writeTemp = vi.fn(async () => '/tmp/guest-contract.docx')
    const writeImageBase64 = vi.fn(async () => '/tmp/guest-image.png')
    const prepareFile = vi.fn(async (filePath: string) => ({
      name: '合同.docx',
      path: filePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: 'extracted contract text'
    }))

    const files = await materializeGuestFiles(
      [
        {
          name: '合同.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dataBase64: Buffer.from('docx-bytes').toString('base64')
        }
      ],
      { writeTemp, writeImageBase64, prepareFile }
    )

    expect(writeTemp).toHaveBeenCalledOnce()
    expect(writeImageBase64).not.toHaveBeenCalled()
    expect(prepareFile).toHaveBeenCalledWith(
      '/tmp/guest-contract.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(files?.[0]).toMatchObject({
      name: '合同.docx',
      path: '/tmp/guest-contract.docx',
      content: 'extracted contract text'
    })
  })

  it('prepares an original local path without copying to temp', async () => {
    const original = '/Users/wangzhaoyu/Downloads/JiaorongAI-应用SDK技术方案-里程碑1.docx'
    const writeTemp = vi.fn()
    const writeImageBase64 = vi.fn()
    const prepareFile = vi.fn(async (filePath: string) => ({
      name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
      path: filePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: 'extracted'
    }))

    const files = await materializeGuestFiles(
      [
        {
          name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
          path: original,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ],
      { writeTemp, writeImageBase64, prepareFile }
    )

    expect(writeTemp).not.toHaveBeenCalled()
    expect(writeImageBase64).not.toHaveBeenCalled()
    expect(prepareFile).toHaveBeenCalledWith(
      original,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(files?.[0]).toMatchObject({
      name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
      path: original
    })
  })

  it('keeps the original file name after writeTemp hashes the path', async () => {
    const writeTemp = vi.fn(async () => '/tmp/5ldcdMICywlwN4IIACM-d.docx')
    const writeImageBase64 = vi.fn()
    const prepareFile = vi.fn(async (filePath: string) => ({
      name: '5ldcdMICywlwN4IIACM-d.docx',
      path: filePath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }))

    const files = await materializeGuestFiles(
      [
        {
          name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: Buffer.from('docx-bytes').toString('base64')
        }
      ],
      { writeTemp, writeImageBase64, prepareFile }
    )

    expect(files?.[0]).toMatchObject({
      name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
      path: '/tmp/5ldcdMICywlwN4IIACM-d.docx'
    })
  })

  it('maps dataBase64 onto content for the official MessageFile shape', () => {
    const file = normalizeMessageFile({
      name: '合同.pdf',
      mimeType: 'application/pdf',
      dataBase64: 'AAA'
    })
    expect(file.content).toBe('AAA')
    expect(file.dataBase64).toBeUndefined()
  })

  it('does not render stored attachment JSON as the user bubble text', () => {
    const parsed = parseUserMessage({
      id: 'm1',
      sessionId: 's1',
      orderSeq: 1,
      role: 'user',
      content: '{"text":"读一下这个文档","files":[{"name":"a.docx","dataBase64":"AAAA',
      status: 'sent',
      isContextEdge: 0,
      metadata: '{}',
      createdAt: 1,
      updatedAt: 1
    })
    expect(parsed.text).toBe('读一下这个文档')
    expect(parsed.text.includes('dataBase64')).toBe(false)
  })

  it('sends host-picked files as original paths without inlining content', async () => {
    const file = await pendingToMessageFile({
      name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
      path: '/Users/wangzhaoyu/Downloads/JiaorongAI-应用SDK技术方案-里程碑1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    expect(file).toEqual({
      name: 'JiaorongAI-应用SDK技术方案-里程碑1.docx',
      path: '/Users/wangzhaoyu/Downloads/JiaorongAI-应用SDK技术方案-里程碑1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { fileName: 'JiaorongAI-应用SDK技术方案-里程碑1.docx' }
    })
    expect(file.content).toBeUndefined()
  })

  it('drops relative paths that have no inline payload', async () => {
    const prepareFile = vi.fn()
    const files = await materializeGuestFiles([{ name: 'secret.env', path: '../../secret.env' }], {
      writeTemp: vi.fn(),
      writeImageBase64: vi.fn(),
      prepareFile
    })
    expect(prepareFile).not.toHaveBeenCalled()
    expect(files).toEqual([])
  })

  it('materializes relative paths that carry inline payload', async () => {
    const writeTemp = vi.fn(async () => '/tmp/guest-note.txt')
    const prepareFile = vi.fn(async (filePath: string) => ({
      name: 'note.txt',
      path: filePath,
      mimeType: 'text/plain',
      content: 'note'
    }))
    const files = await materializeGuestFiles(
      [
        {
          name: 'note.txt',
          path: '../../note.txt',
          mimeType: 'text/plain',
          dataBase64: Buffer.from('note').toString('base64')
        }
      ],
      { writeTemp, writeImageBase64: vi.fn(), prepareFile }
    )
    expect(writeTemp).toHaveBeenCalledOnce()
    expect(files?.[0]).toMatchObject({ name: 'note.txt', path: '/tmp/guest-note.txt' })
  })

  it('keeps jiaorong knowledge-base context as UTF-8 instruction, not a temp file', async () => {
    const writeTemp = vi.fn()
    const writeImageBase64 = vi.fn()
    const prepareFile = vi.fn()
    const instruction = '[交融知识库 · 强制工具调用]\n请使用 knowledge_base_retrieve'
    const files = await materializeGuestFiles(
      [
        {
          name: '知识库',
          path: 'jiaorong-kb://context',
          mimeType: 'application/x-jiaorong-kb-context',
          content: instruction,
          metadata: {
            jiaorongKnowledgeBase: JSON.stringify({
              version: 1,
              selections: [
                { key: 'knowledgeBase:kb-1', kind: 'knowledgeBase', id: 'kb-1', name: 'wzy1' }
              ]
            })
          }
        }
      ],
      { writeTemp, writeImageBase64, prepareFile }
    )
    expect(writeTemp).not.toHaveBeenCalled()
    expect(writeImageBase64).not.toHaveBeenCalled()
    expect(prepareFile).not.toHaveBeenCalled()
    expect(files?.[0]).toMatchObject({
      name: '知识库',
      path: 'jiaorong-kb://context',
      mimeType: 'application/x-jiaorong-kb-context',
      content: instruction
    })
  })
})
