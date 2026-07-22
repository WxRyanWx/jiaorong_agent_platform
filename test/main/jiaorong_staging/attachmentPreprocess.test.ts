import fs from 'fs'
import { describe, expect, it, vi } from 'vitest'
import {
  bufferLooksLikeImage,
  collectEmptyNonImageFiles,
  collectImageAttachments,
  collectUnreadableImageAttachments,
  estimateBase64PayloadBytes,
  estimateDataUrlPayloadBytes,
  resolveImageDataUrl
} from '../../../src/main/jiaorong_staging/attachmentPreprocess/fileHelpers'
import {
  applyStoredAttachmentPreprocessToUserInput,
  applyVisionProgressToDisplayText,
  createVisionUiProgressState,
  estimateAttachmentPreprocessReserveTokens,
  JIAORONG_SKIPPED_IMAGE_META_KEY,
  JIAORONG_VISION_PREPROCESS_META_KEY,
  pickVisionDescription,
  preprocessUserAttachmentsForTextModel,
  stripImagePayloadsForTextModel
} from '../../../src/main/jiaorong_staging/attachmentPreprocess'
import {
  IMAGE_DESCRIPTION_MAX_TOKENS,
  MAX_VISION_IMAGE_BYTES,
  VISION_RESERVE_TOKENS_PER_IMAGE
} from '../../../src/main/jiaorong_staging/attachmentPreprocess/config'
import type { MessageFile } from '@shared/types/agent-interface'

/** 1x1 PNG — valid magic for resolveImageDataUrl. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, 'base64')
const ALLOWED_TEMP_PATH = '/mock/path/temp/shot.png'

function imageFile(overrides: Partial<MessageFile> = {}): MessageFile {
  return {
    name: 'shot.png',
    content: TINY_PNG_DATA_URL,
    mimeType: 'image/png',
    metadata: {
      fileName: 'shot.png',
      fileSize: TINY_PNG_BYTES.length,
      fileDescription: 'image/png',
      fileCreated: new Date().toISOString(),
      fileModified: new Date().toISOString()
    },
    token: 1,
    path: ALLOWED_TEMP_PATH,
    ...overrides
  }
}

function textFile(overrides: Partial<MessageFile> = {}): MessageFile {
  return {
    name: 'note.txt',
    content: 'hello',
    mimeType: 'text/plain',
    metadata: {
      fileName: 'note.txt',
      fileSize: 5,
      fileDescription: 'text/plain',
      fileCreated: new Date().toISOString(),
      fileModified: new Date().toISOString()
    },
    token: 1,
    path: '/tmp/note.txt',
    ...overrides
  }
}

describe('jiaorong_staging attachmentPreprocess fileHelpers', () => {
  it('resolves raw base64 content into a data URL', () => {
    const url = resolveImageDataUrl(
      imageFile({
        content: TINY_PNG_BASE64,
        thumbnail: undefined
      })
    )
    expect(url).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`)
  })

  it('reads path-only images from allowed temp dir into a data URL', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: TINY_PNG_BYTES.length
    } as fs.Stats)
    vi.mocked(fs.realpathSync).mockImplementation((p) => String(p))
    vi.mocked(fs.readFileSync).mockReturnValue(TINY_PNG_BYTES)

    const url = resolveImageDataUrl(
      imageFile({
        content: '',
        thumbnail: undefined,
        path: ALLOWED_TEMP_PATH
      })
    )
    expect(url).toBe(`data:image/png;base64,${TINY_PNG_BYTES.toString('base64')}`)
  })

  it('rejects path-only images outside the allowlist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: TINY_PNG_BYTES.length
    } as fs.Stats)
    vi.mocked(fs.realpathSync).mockImplementation((p) => String(p))

    const url = resolveImageDataUrl(
      imageFile({
        content: '',
        thumbnail: undefined,
        path: '/etc/passwd'
      })
    )
    expect(url).toBeNull()
  })

  it('falls back to thumbnail when content data URL is invalid', () => {
    const url = resolveImageDataUrl(
      imageFile({
        content: 'data:image/png;base64,aaaa',
        thumbnail: TINY_PNG_DATA_URL,
        path: ''
      })
    )
    expect(url).toBe(TINY_PNG_DATA_URL)
  })

  it('estimates data URL payload size from base64 length', () => {
    // 8 base64 chars → 6 decoded bytes (no padding); no need to allocate large buffers.
    expect(estimateBase64PayloadBytes('AAAAAAAA')).toBe(6)
    expect(estimateDataUrlPayloadBytes('data:image/png;base64,AAAAAAAA')).toBe(6)
  })

  it('rejects in-memory data URLs over the configured byte limit', async () => {
    // Mock a tiny limit so we can use the existing small PNG fixture (no 32MB allocation).
    vi.resetModules()
    vi.doMock(
      '../../../src/main/jiaorong_staging/attachmentPreprocess/config',
      async (importOriginal) => {
        const actual =
          await importOriginal<
            typeof import('../../../src/main/jiaorong_staging/attachmentPreprocess/config')
          >()
        return {
          ...actual,
          MAX_VISION_IMAGE_BYTES: 32
        }
      }
    )
    const { resolveImageDataUrl: resolveWithTinyLimit } =
      await import('../../../src/main/jiaorong_staging/attachmentPreprocess/fileHelpers')
    expect(TINY_PNG_BYTES.length).toBeGreaterThan(32)
    expect(
      resolveWithTinyLimit(
        imageFile({
          content: TINY_PNG_DATA_URL,
          thumbnail: undefined,
          path: ''
        })
      )
    ).toBeNull()
    vi.doUnmock('../../../src/main/jiaorong_staging/attachmentPreprocess/config')
    vi.resetModules()
  })

  it('rejects oversized path-only images', () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      size: MAX_VISION_IMAGE_BYTES + 1024
    } as fs.Stats)

    const url = resolveImageDataUrl(
      imageFile({
        content: '',
        thumbnail: undefined,
        path: ALLOWED_TEMP_PATH
      })
    )
    expect(url).toBeNull()
  })

  it('detects PNG magic bytes', () => {
    expect(bufferLooksLikeImage(TINY_PNG_BYTES)).toBe(true)
    expect(bufferLooksLikeImage(Buffer.from('not-an-image'))).toBe(false)
  })

  it('collects only images with usable payloads', () => {
    const refs = collectImageAttachments([
      imageFile(),
      imageFile({ name: 'broken.png', content: '', thumbnail: '', path: '' }),
      textFile()
    ])
    expect(refs).toHaveLength(1)
    expect(refs[0]?.file.name).toBe('shot.png')
  })

  it('collects empty non-image attachments', () => {
    const empty = collectEmptyNonImageFiles([
      textFile({ content: '' }),
      textFile({ content: 'ok' }),
      imageFile({ content: '' })
    ])
    expect(empty).toHaveLength(1)
    expect(empty[0]?.index).toBe(0)
    expect(empty[0]?.file.name).toBe('note.txt')
  })

  it('collects unreadable images with a reason', () => {
    const unread = collectUnreadableImageAttachments([
      imageFile({ content: '', thumbnail: '', path: '' }),
      imageFile()
    ])
    expect(unread).toHaveLength(1)
    expect(unread[0]?.reason).toContain('无法读取')
  })
})

describe('estimateAttachmentPreprocessReserveTokens', () => {
  it('reserves per image before preprocess finishes', () => {
    expect(
      estimateAttachmentPreprocessReserveTokens({
        text: 'hi',
        files: [imageFile(), imageFile({ name: 'b.png' }), textFile()]
      })
    ).toBe(2 * VISION_RESERVE_TOKENS_PER_IMAGE)
  })

  it('returns 0 when there are no images', () => {
    expect(estimateAttachmentPreprocessReserveTokens({ text: 'hi', files: [textFile()] })).toBe(0)
  })
})

describe('pickVisionDescription', () => {
  it('prefers final text over reasoning', () => {
    expect(pickVisionDescription('  final answer  ', 'internal CoT')).toBe('final answer')
  })

  it('does not fall back to reasoning when text is empty', () => {
    expect(
      pickVisionDescription(
        '',
        '系统提示词泄漏\n图中有一张蓝图和尺寸标注\n不要暴露模型型号 jiaorong-qwen'
      )
    ).toBe('')
  })
})

describe('stripImagePayloadsForTextModel', () => {
  it('clears image content and path for the text model', () => {
    const stripped = stripImagePayloadsForTextModel([imageFile(), textFile()])
    expect(stripped[0]).toMatchObject({ content: '', path: '', token: 0 })
    expect(stripped[1]?.content).toBe('hello')
  })
})

describe('applyVisionProgressToDisplayText', () => {
  it('ignores raw deltas and updates on image-done', () => {
    let state = createVisionUiProgressState()
    const started = applyVisionProgressToDisplayText(state, {
      type: 'start',
      modelId: 'vl',
      imageCount: 2
    })
    expect(started.status).toBe('loading')
    expect(started.text).toContain('正在分析图片')
    state = started.state

    const delta = applyVisionProgressToDisplayText(state, { type: 'delta', text: 'tok' })
    expect(delta.status).toBe('unchanged')

    const doneOne = applyVisionProgressToDisplayText(state, {
      type: 'image-done',
      index: 1,
      fileName: 'a.png',
      description: 'cat'
    })
    expect(doneOne.status).toBe('loading')
    expect(doneOne.text).toContain('【图片 1: a.png】')
    expect(doneOne.text).toContain('cat')
    expect(doneOne.text).not.toContain('tok')
  })

  it('clears UI when done with zero descriptions', () => {
    const state = createVisionUiProgressState()
    const started = applyVisionProgressToDisplayText(state, {
      type: 'start',
      modelId: 'vl',
      imageCount: 1
    })
    const cleared = applyVisionProgressToDisplayText(started.state, {
      type: 'done',
      describedImageCount: 0
    })
    expect(cleared.status).toBe('clear')
    expect(cleared.text).toBe('')
  })
})

describe('preprocessUserAttachmentsForTextModel', () => {
  const configPresenter = {
    getModelConfig: vi.fn(() => ({ temperature: 0.2, maxTokens: 900, vision: true })),
    resolveDeepChatAgentConfig: vi.fn(async () => ({
      visionModel: { providerId: 'vision-p', modelId: 'vision-m' }
    })),
    isKnownModel: vi.fn(() => true)
  }

  it('leaves input unchanged when session already supports vision and files are readable', async () => {
    const input = { text: 'hi', files: [imageFile(), textFile()] }
    const result = await preprocessUserAttachmentsForTextModel({
      input,
      sessionSupportsVision: true,
      providerId: 'p',
      modelId: 'm',
      agentId: 'deepchat',
      configPresenter,
      generateVisionCompletion: vi.fn()
    })
    expect(result.input).toEqual(input)
    expect(result.didDescribeImages).toBe(false)
  })

  it('injects vision descriptions when session model has no vision', async () => {
    const generateVisionCompletion = vi.fn(async () => 'A blueprint with dimensions.')
    const result = await preprocessUserAttachmentsForTextModel({
      input: { text: '请分析', files: [imageFile()] },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter: {
        ...configPresenter,
        getModelConfig: vi.fn(() => ({ temperature: 0.2, maxTokens: 900, vision: false }))
      },
      generateVisionCompletion
    })

    expect(generateVisionCompletion).toHaveBeenCalledOnce()
    expect(result.didDescribeImages).toBe(true)
    expect(result.input.text).toContain('请分析')
    expect(result.input.text).toContain('A blueprint with dimensions.')
    expect(result.input.text).toContain('【图片 1: shot.png】')
    expect(result.input.text).toContain('不要再对图片附件调用 read')
    expect(result.input.files?.[0]).toMatchObject({ content: '', path: '' })
    expect(result.visionReasoningText).toContain('A blueprint with dimensions.')
    expect(result.visionReasoningText).toContain('【图片 1: shot.png】')
    expect(result.visionReasoningText).not.toContain('不要再对图片附件调用 read')
    expect(result.clearVisionUi).toBe(false)
    expect(result.persistUserContent?.text).toBe('请分析')
    expect(result.persistUserContent?.files?.[0]?.path).toBe(ALLOWED_TEMP_PATH)
    expect(
      result.persistUserContent?.files?.[0]?.metadata?.[JIAORONG_VISION_PREPROCESS_META_KEY]
    ).toMatchObject({
      index: 1,
      description: 'A blueprint with dimensions.'
    })
  })

  it('clears vision UI flag when describe yields empty results', async () => {
    const result = await preprocessUserAttachmentsForTextModel({
      input: { text: 'hi', files: [imageFile()] },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter,
      generateVisionCompletion: vi.fn(async () => '   ')
    })
    expect(result.didDescribeImages).toBe(false)
    expect(result.clearVisionUi).toBe(true)
  })

  it('annotates empty non-image attachments without requiring vision', async () => {
    const result = await preprocessUserAttachmentsForTextModel({
      input: { text: 'check', files: [textFile({ content: '   ' })] },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter,
      generateVisionCompletion: vi.fn()
    })
    expect(result.emptyNonImageCount).toBe(1)
    expect(result.input.text).toContain('内容提取为空')
    expect(result.didDescribeImages).toBe(false)
  })

  it('falls back to default jiaorong VL model when agent visionModel is unset', async () => {
    const generateVisionCompletion = vi.fn(async () => 'described')
    const result = await preprocessUserAttachmentsForTextModel({
      input: { text: 'hi', files: [imageFile()] },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter: {
        getModelConfig: vi.fn(() => ({
          vision: true,
          maxTokens: 32_000,
          temperature: 0.2
        })),
        resolveDeepChatAgentConfig: vi.fn(async () => ({ visionModel: null })),
        isKnownModel: vi.fn(() => true)
      },
      generateVisionCompletion
    })
    expect(generateVisionCompletion).toHaveBeenCalledOnce()
    expect(generateVisionCompletion.mock.calls[0]?.[0]).toMatchObject({
      providerId: 'jiaorong',
      modelId: 'jiaorong-qwen3-vl-32b-thinking',
      maxTokens: IMAGE_DESCRIPTION_MAX_TOKENS
    })
    expect(result.didDescribeImages).toBe(true)
  })

  it('skips describe when fallback VL is explicitly unknown', async () => {
    const generateVisionCompletion = vi.fn(async () => 'described')
    const result = await preprocessUserAttachmentsForTextModel({
      input: { text: 'hi', files: [imageFile()] },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter: {
        getModelConfig: vi.fn(() => ({ vision: true, maxTokens: 900, temperature: 0.2 })),
        resolveDeepChatAgentConfig: vi.fn(async () => ({ visionModel: null })),
        isKnownModel: vi.fn(() => false)
      },
      generateVisionCompletion
    })
    expect(generateVisionCompletion).not.toHaveBeenCalled()
    expect(result.didDescribeImages).toBe(false)
    expect(result.input.text).toContain('[附件识图未完成]')
    expect(result.input.text).toContain('无可用多模态模型')
  })

  it('reuses stored vision metadata and skips VL on retry', async () => {
    const generateVisionCompletion = vi.fn(async () => 'should-not-run')
    const result = await preprocessUserAttachmentsForTextModel({
      input: {
        text: '再问一次',
        files: [
          imageFile({
            metadata: {
              fileName: 'shot.png',
              fileSize: 12,
              fileDescription: 'image/png',
              fileCreated: new Date().toISOString(),
              fileModified: new Date().toISOString(),
              [JIAORONG_VISION_PREPROCESS_META_KEY]: {
                index: 1,
                description: 'cached blueprint'
              }
            }
          })
        ]
      },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter,
      generateVisionCompletion
    })
    expect(generateVisionCompletion).not.toHaveBeenCalled()
    expect(result.didDescribeImages).toBe(true)
    expect(result.input.text).toContain('cached blueprint')
    expect(result.persistUserContent?.text).toBe('再问一次')
  })

  it('annotates unreadable images instead of dropping them silently', async () => {
    const result = await preprocessUserAttachmentsForTextModel({
      input: {
        text: 'check',
        files: [imageFile({ content: '', thumbnail: '', path: '' })]
      },
      sessionSupportsVision: false,
      providerId: 'text-p',
      modelId: 'text-m',
      agentId: 'deepchat',
      configPresenter,
      generateVisionCompletion: vi.fn()
    })
    expect(result.didDescribeImages).toBe(false)
    expect(result.input.text).toContain('[附件识图未完成]')
    expect(result.input.text).toContain('无法读取')
    expect(
      result.persistUserContent?.files?.[0]?.metadata?.[JIAORONG_SKIPPED_IMAGE_META_KEY]
    ).toMatchObject({
      index: 1
    })
  })
})

describe('buildPersistableUserContent index matching', () => {
  it('keeps descriptions aligned for duplicate filenames', async () => {
    const { buildPersistableUserContent } =
      await import('../../../src/main/jiaorong_staging/attachmentPreprocess/historyPersist')
    const persisted = buildPersistableUserContent({
      displayText: 'two',
      files: [
        imageFile({ name: 'shot.png' }),
        imageFile({ name: 'shot.png', path: '/tmp/shot-2.png' })
      ],
      imageBlocks: [
        { index: 1, fileName: 'shot.png', description: 'first' },
        { index: 2, fileName: 'shot.png', description: 'second' }
      ],
      emptyFileIndexes: []
    })
    expect(persisted.files[0]?.metadata?.[JIAORONG_VISION_PREPROCESS_META_KEY]).toMatchObject({
      description: 'first'
    })
    expect(persisted.files[1]?.metadata?.[JIAORONG_VISION_PREPROCESS_META_KEY]).toMatchObject({
      description: 'second'
    })
  })

  it('marks empty attachments by file index, not by name', async () => {
    const { buildPersistableUserContent, JIAORONG_EMPTY_ATTACHMENT_META_KEY } =
      await import('../../../src/main/jiaorong_staging/attachmentPreprocess/historyPersist')
    const persisted = buildPersistableUserContent({
      displayText: 'docs',
      files: [
        textFile({ name: 'report.pdf', content: '' }),
        textFile({ name: 'report.pdf', content: 'body' })
      ],
      imageBlocks: [],
      emptyFileIndexes: [1]
    })
    expect(persisted.files[0]?.metadata?.[JIAORONG_EMPTY_ATTACHMENT_META_KEY]).toBe(true)
    expect(persisted.files[1]?.metadata?.[JIAORONG_EMPTY_ATTACHMENT_META_KEY]).toBeUndefined()
  })
})

describe('applyStoredAttachmentPreprocessToUserInput', () => {
  it('rehydrates descriptions from file metadata for history turns', () => {
    const stored = {
      text: '请分析',
      files: [
        imageFile({
          metadata: {
            fileName: 'shot.png',
            fileSize: 12,
            fileDescription: 'image/png',
            fileCreated: new Date().toISOString(),
            fileModified: new Date().toISOString(),
            [JIAORONG_VISION_PREPROCESS_META_KEY]: {
              index: 1,
              description: 'A blueprint with dimensions.'
            }
          }
        })
      ]
    }
    const rehydrated = applyStoredAttachmentPreprocessToUserInput(stored)
    expect(rehydrated.text).toContain('请分析')
    expect(rehydrated.text).toContain('A blueprint with dimensions.')
    expect(rehydrated.text).toContain('不要再对图片附件调用 read')
    expect(rehydrated.files?.[0]).toMatchObject({ content: '', path: '' })
  })

  it('rehydrates skipped-image reasons from metadata', () => {
    const stored = {
      text: '看图',
      files: [
        imageFile({
          content: '',
          path: '/tmp/broken.png',
          metadata: {
            fileName: 'shot.png',
            fileSize: 12,
            fileDescription: 'image/png',
            fileCreated: new Date().toISOString(),
            fileModified: new Date().toISOString(),
            [JIAORONG_SKIPPED_IMAGE_META_KEY]: {
              index: 1,
              reason: '图片过大（超过 32MB），已跳过识图'
            }
          }
        })
      ]
    }
    const rehydrated = applyStoredAttachmentPreprocessToUserInput(stored)
    expect(rehydrated.text).toContain('[附件识图未完成]')
    expect(rehydrated.text).toContain('超过 32MB')
    expect(rehydrated.files?.[0]).toMatchObject({ content: '', path: '' })
  })
})
