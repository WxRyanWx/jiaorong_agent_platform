import { describe, expect, it } from 'vitest'
import { parseAppManifest } from '../../../src/jiaorong_src/appHost/main/manifest'

describe('jiaorong app manifest spawn', () => {
  it('reads spawn and ignores legacy node blocks', () => {
    const manifest = parseAppManifest({
      id: 'app-scaffold',
      name: '应用脚手架',
      version: '0.0.31-dev',
      entry: 'web-ui/index.html',
      spawn: 'node node/server.js',
      node: {
        entry: 'node/server.js',
        startCommand: 'node node/server.js',
        port: 8787
      }
    })
    expect(manifest?.spawn).toBe('node node/server.js')
    expect(manifest).not.toHaveProperty('node')
  })
})
