import { describe, expect, it, vi } from 'vitest'
import type { NavigationGuardWithThis } from 'vue-router'

const loadRouter = async () => {
  vi.resetModules()
  vi.doMock('vue-router', async () => vi.importActual<typeof import('vue-router')>('vue-router'))
  return (await import('../../../src/renderer/src/router')).default
}

const hostPluginsGuard = async () => {
  const router = await loadRouter()
  const route = router.options.routes.find((item) => item.path === '/plugins')
  const guard = route?.beforeEnter
  expect(guard).toEqual(expect.any(Function))
  return guard as NavigationGuardWithThis<undefined>
}

describe('plugins router', () => {
  it('owns the only Skills management route', async () => {
    const router = await loadRouter()

    expect(router.resolve({ name: 'plugins-skills' }).path).toBe('/plugins/skills')
  })

  it('resolves built-in OCR before the dynamic plugin detail route', async () => {
    const router = await loadRouter()

    expect(router.resolve({ name: 'plugins-builtin-ocr' }).path).toBe('/plugins/builtin/ocr')
    expect(router.resolve('/plugins/builtin/ocr').name).toBe('plugins-builtin-ocr')
  })

  it('redirects non-admin users away from the host plugins hub', async () => {
    localStorage.removeItem('userInfo')
    const guard = await hostPluginsGuard()

    expect(guard({} as never, {} as never, (() => undefined) as never)).toEqual({ name: 'chat' })
  })

  it('keeps the host plugins hub open for admin users', async () => {
    const guard = await hostPluginsGuard()
    const { applySettingsSidebarAdminWhitelist } =
      await import('@jiaorong/config/settingsSidebarAdmin')
    applySettingsSidebarAdminWhitelist(['13039619789'])
    localStorage.setItem('userInfo', JSON.stringify({ phone: '13039619789' }))

    expect(guard({} as never, {} as never, (() => undefined) as never)).toBe(true)
    localStorage.removeItem('userInfo')
    applySettingsSidebarAdminWhitelist([])
  })
})
