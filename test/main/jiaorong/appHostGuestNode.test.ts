import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGuestNodeEnv,
  guestNodeBootstrapSource
} from '../../../src/jiaorong_src/appHost/main/guestNode'
import { parseAppManifest } from '../../../src/jiaorong_src/appHost/main/manifest'
import { getNodeBridgeFile } from '../../../src/jiaorong_src/appHost/main/paths'

const nodeRequire = createRequire(import.meta.url)
const { allowedOrigin } = nodeRequire(
  '../../../src/jiaorong_src/apps/demo-workbench/node/app/middleware/cors.js'
) as { allowedOrigin: (origin: unknown) => string }

/** 与 electron-vite esmShimPlugin 相同，用来抓静态 import。 */
const ESM_STATIC_IMPORT_RE =
  /(?<=\s|^|;)import\s*([\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^\s"](?=\s*")|(?<='\s*)[^']*[^\s'](?=\s*'))\s*["'][\s;]*/gmu

describe('jiaorong app node bootstrap', () => {
  it('does not contain static import statements that steal the main ESM shim', () => {
    expect(guestNodeBootstrapSource.match(ESM_STATIC_IMPORT_RE)).toBeNull()
  })

  it('reports the kernel-assigned listen port back to the host', () => {
    expect(guestNodeBootstrapSource).toContain("type: 'listening'")
    expect(guestNodeBootstrapSource).toContain('net.Server.prototype.listen')
    expect(guestNodeBootstrapSource).toContain('requested !== 0')
  })

  it('accepts node without port so host can pick a free one', () => {
    const manifest = parseAppManifest({
      id: 'demo-workbench',
      name: '示例工作台',
      version: '0.0.19-dev',
      entry: 'web-ui/index.html',
      node: {
        entry: 'node/server.js',
        startCommand: 'node node/server.js'
      }
    })
    expect(manifest?.node).toEqual({
      entry: 'node/server.js',
      startCommand: 'node node/server.js'
    })
  })

  it('does not copy host secrets into guest node env', () => {
    const previous = process.env.JIAORONG_AUTH_TOKEN
    process.env.JIAORONG_AUTH_TOKEN = 'secret-token'
    process.env.SOME_HOST_SECRET = 'leak-me'
    try {
      const env = buildGuestNodeEnv({
        appId: 'demo-workbench',
        entry: '/tmp/app.js'
      })
      expect(env.JIAORONG_NODE_PORT).toBe('0')
      expect(env.JIAORONG_NODE_HOST).toBe('127.0.0.1')
      expect(env.JIAORONG_APP_ID).toBe('demo-workbench')
      expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
      expect(env.JIAORONG_AUTH_TOKEN).toBeUndefined()
      expect(env.SOME_HOST_SECRET).toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.JIAORONG_AUTH_TOKEN
      else process.env.JIAORONG_AUTH_TOKEN = previous
      delete process.env.SOME_HOST_SECRET
    }
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

describe('jiaorong standalone node bridge file', () => {
  it('writes the debug endpoint under the app home dir', () => {
    expect(getNodeBridgeFile('/tmp/home')).toBe(
      path.join('/tmp/home', '.jiaorongchat', 'node-bridge.json')
    )
  })
})
