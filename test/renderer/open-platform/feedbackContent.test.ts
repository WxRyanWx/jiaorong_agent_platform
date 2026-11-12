import { describe, expect, it } from 'vitest'
import {
  buildFeedbackComment,
  canSubmitFeedback,
  clipFeedbackText,
  feedbackImageRejection,
  previewFeedbackComment,
  readFeedbackEditor
} from '@jiaorong/open-platform/renderer/feedbackContent'

const empty = { parts: [], textLength: 0, imageCount: 0, hasText: false }

describe('feedback content', () => {
  it('builds the same comment html the web client submits', () => {
    const html = buildFeedbackComment([
      { kind: 'image', fileToken: '14b7c9cda3289a9b7d2920b08d6017aa' },
      { kind: 'text', text: '123' }
    ])

    expect(html).toBe(
      '<p><img src="/api/sys-storage/download?f8s=14b7c9cda3289a9b7d2920b08d6017aa" alt="" data-href="" style=""/>123</p>'
    )
  })

  it('escapes pasted text and drops unsafe image tokens', () => {
    const html = buildFeedbackComment([
      { kind: 'text', text: '<script>alert(1)</script>' },
      { kind: 'image', fileToken: 'bad token' }
    ])

    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).not.toContain('<script>')
  })

  it('reads typed text and uploaded images, ignoring a placeholder break', () => {
    const root = document.createElement('div')
    root.innerHTML = '你好<img data-f8s="abc123" src="blob:local"><br>'

    expect(readFeedbackEditor(root)).toEqual({
      parts: [
        { kind: 'text', text: '你好' },
        { kind: 'image', fileToken: 'abc123' },
        { kind: 'text', text: '\n' }
      ],
      textLength: 2,
      imageCount: 1,
      hasText: true
    })
  })

  it('ignores images that were not uploaded by this editor', () => {
    const root = document.createElement('div')
    root.innerHTML = '<img src="https://example.com/a.png">'

    expect(readFeedbackEditor(root).imageCount).toBe(0)
  })

  it('allows submit when there is a rating, text, or an image', () => {
    expect(canSubmitFeedback(0, empty)).toBe(false)
    expect(canSubmitFeedback(5, empty)).toBe(true)
    expect(canSubmitFeedback(0, { ...empty, hasText: true, textLength: 2 })).toBe(true)
    expect(canSubmitFeedback(0, { ...empty, imageCount: 1 })).toBe(true)
  })

  it('clips pasted text at 5000 characters without counting line breaks', () => {
    expect(clipFeedbackText('abcd', 4998)).toBe('ab')
    expect(clipFeedbackText('a\nb', 4999)).toBe('a\n')
  })

  it('rejects unsupported, oversized, and extra images', () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    const huge = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })

    expect(feedbackImageRejection(png, 0)).toBeNull()
    expect(feedbackImageRejection(gif, 0)).toMatch(/jpg/)
    expect(feedbackImageRejection(huge, 0)).toMatch(/50MB/)
    expect(feedbackImageRejection(png, 10)).toMatch(/10/)
  })

  it('previews comment text and the first stored image', () => {
    const html = '<p><img src="/api/sys-storage/download?f8s=abc123" alt=""/>你好 &lt;b&gt;</p>'

    expect(previewFeedbackComment(html)).toEqual({ text: '你好 <b>', fileToken: 'abc123' })
    expect(previewFeedbackComment(`${'字'.repeat(60)}`).text.endsWith('...')).toBe(true)
  })
})
