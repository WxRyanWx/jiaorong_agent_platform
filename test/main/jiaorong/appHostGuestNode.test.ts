import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { parseAppManifest } from '../../../src/jiaorong_src/appHost/main/manifest'

const nodeRequire = createRequire(import.meta.url)
const { allowedOrigin } = nodeRequire(
  '../../../src/jiaorong_src/apps/app-scaffold/node/app/middleware/cors.js'
) as { allowedOrigin: (origin: unknown) => string }

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

describe('jiaorong app node cors', () => {
  it('allows protocol guests and loopback vite origins', () => {
    expect(allowedOrigin('jiaorong-app://test')).toBe('jiaorong-app://test')
    expect(allowedOrigin('http://localhost:5174')).toBe('http://localhost:5174')
    expect(allowedOrigin('http://127.0.0.1:5174')).toBe('http://127.0.0.1:5174')
    expect(allowedOrigin('https://evil.test')).toBe('')
    expect(allowedOrigin('http://example.com')).toBe('')
  })
})
