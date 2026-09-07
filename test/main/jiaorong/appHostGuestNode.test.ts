import { describe, expect, it } from 'vitest'
import {
  buildGuestNodeEnv,
  guestNodeBootstrapSource
} from '../../../src/jiaorong_src/appHost/main/guestNode'

/** 与 electron-vite esmShimPlugin 相同，用来抓静态 import。 */
const ESM_STATIC_IMPORT_RE =
  /(?<=\s|^|;)import\s*([\s"']*(?<imports>[\p{L}\p{M}\w\t\n\r $*,/{}@.]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^\s"](?=\s*")|(?<='\s*)[^']*[^\s'](?=\s*'))\s*["'][\s;]*/gmu

describe('jiaorong app node bootstrap', () => {
  it('does not contain static import statements that steal the main ESM shim', () => {
    expect(guestNodeBootstrapSource.match(ESM_STATIC_IMPORT_RE)).toBeNull()
  })

  it('does not copy host secrets into guest node env', () => {
    const previous = process.env.JIAORONG_AUTH_TOKEN
    process.env.JIAORONG_AUTH_TOKEN = 'secret-token'
    process.env.SOME_HOST_SECRET = 'leak-me'
    try {
      const env = buildGuestNodeEnv({
        appId: 'demo-workbench',
        entry: '/tmp/app.js',
        port: 8787
      })
      expect(env.JIAORONG_NODE_PORT).toBe('8787')
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
