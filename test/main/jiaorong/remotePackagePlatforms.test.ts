import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')

import { peekRemotePlatformDeclaration } from '../../../src/jiaorong_src/appHost/main/remotePackagePlatforms'

describe('remote package platforms', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not download the package when range is ignored', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(new Uint8Array([0]), {
        status: 200,
        headers: { 'content-length': String(9 * 1024 * 1024) }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      peekRemotePlatformDeclaration('https://api.example.com/app1.zip')
    ).resolves.toEqual({ known: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
