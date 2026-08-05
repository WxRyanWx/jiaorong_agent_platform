import { afterEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()

vi.mock('../../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args)
  }
}))

describe('loadKnowledgeBaseIconObjectUrl cache', () => {
  afterEach(async () => {
    const { clearKnowledgeBaseIconObjectUrlCache } =
      await import('../../../../src/jiaorong_src/knowledgeBase/picker/resolveKbIconUrl')
    clearKnowledgeBaseIconObjectUrlCache()
    getMock.mockReset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reuses cached object url for the same icon hash', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    getMock.mockResolvedValue(blob)

    const createObjectURL = vi.fn(() => 'blob:icon-1')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL
    })

    const { loadKnowledgeBaseIconObjectUrl } =
      await import('../../../../src/jiaorong_src/knowledgeBase/picker/resolveKbIconUrl')

    const first = await loadKnowledgeBaseIconObjectUrl('hash-a')
    const second = await loadKnowledgeBaseIconObjectUrl('hash-a')

    expect(first).toBe('blob:icon-1')
    expect(second).toBe('blob:icon-1')
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })
})
