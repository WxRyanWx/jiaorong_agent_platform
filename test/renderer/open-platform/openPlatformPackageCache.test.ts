import { describe, expect, it } from 'vitest'
import {
  forgetOpenPlatformPackage,
  readOpenPlatformPackage,
  rememberOpenPlatformPackage
} from '../../../src/jiaorong_src/open-platform/renderer/packageCache'

const createFile = (name: string) => new File(['zip-bytes'], name, { type: 'application/zip' })

describe('open platform package cache', () => {
  it('keeps the package chosen when the asset was created', async () => {
    const file = createFile('created-skill.zip')
    await rememberOpenPlatformPackage('skill', 'cache-skill-a', file)

    const cached = await readOpenPlatformPackage('skill', 'cache-skill-a')
    expect(cached?.name).toBe('created-skill.zip')
    expect(cached?.size).toBe('zip-bytes'.length)
  })

  it('separates skills from connectors with the same asset id', async () => {
    await rememberOpenPlatformPackage('skill', 'shared-id', createFile('skill.zip'))
    await rememberOpenPlatformPackage('connector', 'shared-id', createFile('connector.zip'))

    expect((await readOpenPlatformPackage('skill', 'shared-id'))?.name).toBe('skill.zip')
    expect((await readOpenPlatformPackage('connector', 'shared-id'))?.name).toBe('connector.zip')
  })

  it('drops the package once the asset is removed', async () => {
    await rememberOpenPlatformPackage('skill', 'cache-skill-b', createFile('gone.zip'))
    await forgetOpenPlatformPackage('skill', 'cache-skill-b')

    expect(await readOpenPlatformPackage('skill', 'cache-skill-b')).toBeNull()
  })

  it('returns null for assets that never had a package', async () => {
    expect(await readOpenPlatformPackage('connector', 'never-created')).toBeNull()
  })
})
