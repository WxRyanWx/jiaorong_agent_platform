import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, { appId: string; key: string; agentId: string }>()

vi.mock('../../../src/jiaorong_src/appHost/main/agentMap', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/jiaorong_src/appHost/main/agentMap')>()
  return {
    ...actual,
    getAppAgentBinding: (appId: string, key: string) => store.get(`${appId}::${key}`) ?? null,
    getAppAgentBindingByAgentId: (appId: string, agentId: string) =>
      [...store.values()].find((item) => item.appId === appId && item.agentId === agentId) ?? null,
    listAppAgentBindings: (appId: string) =>
      [...store.values()].filter((item) => item.appId === appId),
    upsertAppAgentBinding: (binding: { appId: string; key: string; agentId: string }) => {
      store.set(`${binding.appId}::${binding.key}`, binding)
    },
    appAgentIds: (appId: string) =>
      new Set(
        [...store.values()].filter((item) => item.appId === appId).map((item) => item.agentId)
      ),
    isJiaorongAppHiddenAgentId: (agentId: string) =>
      [...store.values()].some((item) => item.agentId === agentId),
    listJiaorongAppHiddenAgentIds: () => [
      ...new Set([...store.values()].map((item) => item.agentId))
    ]
  }
})

import { isJiaorongBridgeFailure } from '../../../src/jiaorong_src/appHost/bridgeErrors'
import { handleAppBridgeInvoke } from '../../../src/jiaorong_src/appHost/main/bridge'
import { appAgentMapKey } from '../../../src/jiaorong_src/appHost/main/agentMap'
import {
  bindGuestAppId,
  unbindGuest,
  normalizeGuestDir,
  getBoundGuestAppId,
  getSessionOwner,
  rememberSessionOwner
} from '../../../src/jiaorong_src/appHost/main/guestBind'
import type { JiaorongAppHostDeps } from '../../../src/jiaorong_src/appHost/main/deps'
import type { JiaorongAppRuntime } from '../../../src/jiaorong_src/appHost/types'

const runtime: JiaorongAppRuntime = {
  id: 'demo-workbench',
  name: '示例工作台',
  version: '0.0.2-dev',
  description: '',
  icon: 'icon.png',
  slot: 'menu',
  source: 'builtin',
  enabled: true,
  auth: null,
  package: { kind: 'dir', builtinDir: 'demo-workbench' },
  visible: true,
  installStatus: 'installed',
  installedVersion: '0.0.2-dev',
  appDir: '/tmp/demo-workbench',
  entry: 'web-ui/index.html',
  node: null
}

function deps(overrides?: Partial<JiaorongAppHostDeps>): JiaorongAppHostDeps {
  return {
    getAuthSession: () => undefined,
    getLocale: () => 'zh-CN',
    getTheme: () => 'light',
    ...overrides
  }
}

describe('jiaorong app dialogue bridge', () => {
  beforeEach(() => {
    store.clear()
    unbindGuest(1)
  })

  it('keeps guest identity after disconnect', async () => {
    bindGuestAppId(1, 'demo-workbench')
    const result = await handleAppBridgeInvoke(deps(), runtime, 'disconnect', {}, 1)
    expect(result).toEqual({ ok: true })
    expect(getBoundGuestAppId(1)).toBe('demo-workbench')
  })

  it('returns persisted userInfo from userinfo.get', async () => {
    bindGuestAppId(1, 'demo-workbench')
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({
          token: 'xk-token',
          userInfo: JSON.stringify({ userName: 'L20184974', displayName: '赵' })
        })
      }),
      runtime,
      'userinfo.get',
      { appId: 'demo-workbench' },
      1
    )
    expect(result).toEqual({
      userName: 'L20184974',
      displayName: '赵',
      token: 'xk-token'
    })
  })

  it('treats known code+message payloads as SDK failures', () => {
    expect(isJiaorongBridgeFailure({ code: 'UNAUTHORIZED', message: '未登录' })).toBe(true)
    expect(isJiaorongBridgeFailure({ code: 'FORBIDDEN', message: 'nope', ok: true })).toBe(false)
    expect(isJiaorongBridgeFailure({ accepted: true, code: 'FORBIDDEN', message: 'no' })).toBe(
      false
    )
  })

  it('builds a stable appId+key map key', () => {
    expect(appAgentMapKey('demo-workbench', 'workbench')).toBe('demo-workbench::workbench')
  })

  it('hides agents marked with jiaorongAppId even without a map file', async () => {
    const { agentHasJiaorongAppMark } =
      await import('../../../src/jiaorong_src/appHost/main/agentMap')
    expect(agentHasJiaorongAppMark({ config: { jiaorongAppId: 'demo-workbench' } })).toBe(true)
    expect(agentHasJiaorongAppMark({ config: null })).toBe(false)
  })

  it('collects hidden agent ids from jiaorongAppId config marks', async () => {
    const { collectJiaorongAppHiddenAgentIds } =
      await import('../../../src/jiaorong_src/appHost/main/agentMap')
    const ids = collectJiaorongAppHiddenAgentIds([
      { id: 'marked-agent', config: { jiaorongAppId: 'demo-workbench' } },
      { id: 'official-agent', config: {} }
    ])
    expect(ids.has('marked-agent')).toBe(true)
    expect(ids.has('official-agent')).toBe(false)
  })

  it('returns UNAUTHORIZED for agent methods without a token', async () => {
    const result = await handleAppBridgeInvoke(
      deps(),
      runtime,
      'agent.create',
      { appId: 'demo-workbench', key: 'workbench', name: '示例工作台助手' },
      1
    )
    expect(result).toEqual({ code: 'UNAUTHORIZED', message: '未登录' })
  })

  it('creates an app agent once and returns the same mapping on retry', async () => {
    const createDeepChatAgent = vi.fn().mockResolvedValue({
      id: 'deepchat-app1',
      name: '示例工作台助手',
      enabled: true
    })
    const getAgent = vi.fn().mockResolvedValue({
      id: 'deepchat-app1',
      name: '示例工作台助手',
      enabled: true
    })
    const loggedIn = deps({
      getAuthSession: () => ({ token: 'tok-1' }),
      dialogue: {
        createDeepChatAgent,
        updateDeepChatAgent: vi.fn(),
        listAgents: vi.fn(),
        getAgent,
        createSession: vi.fn(),
        getSession: vi.fn(),
        listLightweight: vi.fn(),
        listMessagesPage: vi.fn(),
        getMessage: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        searchHistory: vi.fn(),
        sendMessage: vi.fn(),
        steerActiveTurn: vi.fn(),
        cancelGeneration: vi.fn(),
        respondToolInteraction: vi.fn()
      }
    })

    const first = (await handleAppBridgeInvoke(
      loggedIn,
      runtime,
      'agent.create',
      { appId: 'demo-workbench', key: 'unit-test-agent', name: '示例工作台助手' },
      1
    )) as { id: string; created: boolean; source: string }

    const second = (await handleAppBridgeInvoke(
      loggedIn,
      runtime,
      'agent.create',
      { appId: 'demo-workbench', key: 'unit-test-agent', name: '示例工作台助手' },
      1
    )) as { id: string; created: boolean }

    expect(first.source).toBe('app')
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.id).toBe(first.id)
    expect(createDeepChatAgent).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite prompt on create retry, and skips update when unchanged', async () => {
    const existing = {
      id: 'deepchat-app3',
      name: '示例工作台助手',
      enabled: true,
      config: {
        systemPrompt: 'keep this prompt',
        enabledSkillNames: ['app.demo-workbench.contract-review']
      }
    }
    const createDeepChatAgent = vi.fn()
    const updateDeepChatAgent = vi.fn().mockResolvedValue({
      ...existing,
      config: {
        ...existing.config,
        jiaorongAppId: 'demo-workbench',
        jiaorongAppKey: 'workbench'
      }
    })
    const getAgent = vi.fn().mockResolvedValue(existing)
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'deepchat-app3'
    })
    const loggedIn = deps({
      getAuthSession: () => ({ token: 'tok-1' }),
      dialogue: {
        createDeepChatAgent,
        updateDeepChatAgent,
        listAgents: vi.fn(),
        getAgent,
        createSession: vi.fn(),
        getSession: vi.fn(),
        listLightweight: vi.fn(),
        listMessagesPage: vi.fn(),
        getMessage: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        searchHistory: vi.fn(),
        sendMessage: vi.fn(),
        steerActiveTurn: vi.fn(),
        cancelGeneration: vi.fn(),
        respondToolInteraction: vi.fn()
      }
    })

    const reused = (await handleAppBridgeInvoke(
      loggedIn,
      runtime,
      'agent.create',
      { appId: 'demo-workbench', key: 'workbench', name: '示例工作台助手' },
      1
    )) as { created: boolean; config?: { systemPrompt?: string } }
    expect(reused.created).toBe(false)
    expect(reused.config?.systemPrompt).toBe('keep this prompt')
    expect(createDeepChatAgent).not.toHaveBeenCalled()

    const marked = (await handleAppBridgeInvoke(
      loggedIn,
      runtime,
      'agent.update',
      {
        appId: 'demo-workbench',
        key: 'workbench',
        name: '示例工作台助手',
        config: { systemPrompt: 'keep this prompt' }
      },
      1
    )) as { updated: boolean }
    expect(marked.updated).toBe(true)
    expect(updateDeepChatAgent).toHaveBeenCalledWith(
      'deepchat-app3',
      expect.objectContaining({
        config: expect.objectContaining({
          systemPrompt: 'keep this prompt',
          jiaorongAppId: 'demo-workbench',
          jiaorongAppKey: 'workbench'
        })
      })
    )

    updateDeepChatAgent.mockResolvedValue({
      ...existing,
      config: { ...existing.config, systemPrompt: 'new prompt' }
    })
    const written = (await handleAppBridgeInvoke(
      loggedIn,
      runtime,
      'agent.update',
      {
        appId: 'demo-workbench',
        key: 'workbench',
        config: { systemPrompt: 'new prompt' }
      },
      1
    )) as { updated: boolean }
    expect(written.updated).toBe(true)
    expect(updateDeepChatAgent).toHaveBeenCalledTimes(2)
  })

  it('keeps this app and official skills and drops other app config', async () => {
    const createDeepChatAgent = vi.fn().mockResolvedValue({
      id: 'deepchat-app2',
      name: '示例工作台助手',
      enabled: true
    })
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent,
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'agent.create',
      {
        appId: 'demo-workbench',
        key: 'skill-filter',
        name: '示例工作台助手',
        config: {
          enabledSkillNames: [
            'app.demo-workbench.contract-review',
            'app.other.secret',
            'web-search'
          ],
          systemPrompt: 'keep this prompt',
          permissionMode: 'full_access',
          assistantModel: { providerId: 'jiaorong', modelId: 'm1' },
          temperature: 0.2
        }
      },
      1
    )
    expect(result).toMatchObject({ created: true, id: 'deepchat-app2' })
    expect(createDeepChatAgent).toHaveBeenCalledWith({
      name: '示例工作台助手',
      enabled: true,
      description: undefined,
      icon: undefined,
      avatar: undefined,
      config: {
        enabledSkillNames: ['app.demo-workbench.contract-review', 'web-search'],
        systemPrompt: 'keep this prompt',
        permissionMode: 'full_access',
        assistantModel: { providerId: 'jiaorong', modelId: 'm1' },
        jiaorongAppId: 'demo-workbench',
        jiaorongAppKey: 'skill-filter'
      }
    })
  })

  it('returns UNAUTHORIZED for catalog.slash without a token', async () => {
    const result = await handleAppBridgeInvoke(
      deps(),
      runtime,
      'catalog.slash',
      { appId: 'demo-workbench' },
      1
    )
    expect(result).toEqual({ code: 'UNAUTHORIZED', message: '未登录' })
  })

  it('rejects relative projectDir on session.create', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const createSession = vi.fn()
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({ id: 'ag-1', name: '助手', enabled: true }),
          createSession,
          getSession: vi.fn(),
          listLightweight: vi
            .fn()
            .mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.create',
      {
        appId: 'demo-workbench',
        agentId: 'ag-1',
        message: 'hello',
        projectDir: 'relative/path'
      },
      1
    )
    expect(result).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'projectDir 必须是绝对路径'
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects projectDir that escapes an owned session directory with ..', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const createSession = vi.fn()
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({ id: 'ag-1', name: '助手', enabled: true }),
          createSession,
          getSession: vi.fn(),
          listLightweight: vi.fn().mockResolvedValue({
            items: [{ id: 's-1', agentId: 'ag-1', projectDir: '/tmp/work', updatedAt: 1 }],
            nextCursor: null,
            hasMore: false
          }),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.create',
      {
        appId: 'demo-workbench',
        agentId: 'ag-1',
        message: 'hello',
        projectDir: '/tmp/work/../../../etc'
      },
      1
    )
    expect(result).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'projectDir 不允许用于本应用'
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects dialog.allowProjectDir until the folder picker has chosen the path', async () => {
    const result = await handleAppBridgeInvoke(
      deps({ getAuthSession: () => ({ token: 'tok-1' }) }),
      runtime,
      'dialog.allowProjectDir',
      { appId: 'demo-workbench', path: '/tmp/work/' },
      1
    )
    expect(result).toEqual({
      code: 'FORBIDDEN',
      message: '目录必须通过文件夹选择器选择'
    })
  })

  it('allows session.create with a trailing slash when an owned session already uses that dir', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const createSession = vi.fn().mockResolvedValue({
      id: 's-2',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    })
    const created = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({ id: 'ag-1', name: '助手', enabled: true }),
          createSession,
          getSession: vi.fn(),
          listLightweight: vi.fn().mockResolvedValue({
            items: [{ id: 's-1', agentId: 'ag-1', projectDir: '/tmp/work/', updatedAt: 1 }],
            nextCursor: null,
            hasMore: false
          }),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.create',
      {
        appId: 'demo-workbench',
        agentId: 'ag-1',
        message: 'hello',
        projectDir: '/tmp/work/'
      },
      1
    )
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: '/tmp/work' }),
      1
    )
    expect(created).toMatchObject({
      session: expect.objectContaining({ id: 's-2', projectDir: '/tmp/work' })
    })
  })

  it('allows session.create for a Windows project dir already used by an owned session', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const createSession = vi.fn().mockResolvedValue({
      id: 's-win',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: 'C:\\tmp\\work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    })
    const created = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({ id: 'ag-1', name: '助手', enabled: true }),
          createSession,
          getSession: vi.fn(),
          listLightweight: vi.fn().mockResolvedValue({
            items: [{ id: 's-1', agentId: 'ag-1', projectDir: 'C:\\tmp\\work\\', updatedAt: 1 }],
            nextCursor: null,
            hasMore: false
          }),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.create',
      {
        appId: 'demo-workbench',
        agentId: 'ag-1',
        message: 'hello',
        projectDir: 'C:/tmp/work/'
      },
      1
    )
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: 'c:\\tmp\\work' }),
      1
    )
    expect(created).toMatchObject({
      session: expect.objectContaining({ id: 's-win', projectDir: 'C:\\tmp\\work' })
    })
  })

  it('pins an owned session through session.pin', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const toggleSessionPinned = vi.fn().mockResolvedValue({
      id: 's-1',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: true,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    })
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn().mockResolvedValue({
            id: 's-1',
            agentId: 'ag-1',
            title: 'hello',
            projectDir: '/tmp/work',
            isPinned: false,
            sessionKind: 'chat',
            orchestrationPolicy: {},
            toolModeOverride: null,
            createdAt: 1,
            updatedAt: 1,
            status: 'idle'
          }),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          toggleSessionPinned,
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.pin',
      { appId: 'demo-workbench', sessionId: 's-1', pinned: true },
      1
    )
    expect(toggleSessionPinned).toHaveBeenCalledWith('s-1', true)
    expect(result).toMatchObject({
      session: expect.objectContaining({ id: 's-1', isPinned: true })
    })
  })

  it('forgets session owner after session.delete', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    rememberSessionOwner('s-1', 'demo-workbench')
    expect(getSessionOwner('s-1')).toBe('demo-workbench')
    const owned = {
      id: 's-1',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    }
    await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn().mockResolvedValue(owned),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn().mockResolvedValue(undefined),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.delete',
      { appId: 'demo-workbench', sessionId: 's-1' },
      1
    )
    expect(getSessionOwner('s-1')).toBeNull()
  })

  it('normalizes unix, windows, and drive-root project dirs', () => {
    expect(normalizeGuestDir('/tmp/work/')).toBe('/tmp/work')
    expect(normalizeGuestDir('/tmp/work\\')).toBe('/tmp/work')
    expect(normalizeGuestDir('/')).toBe('/')
    expect(normalizeGuestDir('C:\\tmp\\work\\')).toBe('c:\\tmp\\work')
    expect(normalizeGuestDir('C:/tmp/work/')).toBe('c:\\tmp\\work')
    expect(normalizeGuestDir('C:\\')).toBe('c:\\')
    expect(normalizeGuestDir('C:/')).toBe('c:\\')
    expect(normalizeGuestDir('\\\\server\\share\\')).toBe('\\\\server\\share')
    expect(normalizeGuestDir('//server/share/')).toBe('\\\\server\\share')
    expect(normalizeGuestDir('C:\\Tmp\\Work\\')).toBe('c:\\tmp\\work')
  })

  it('restores session messages with 10 by default and forwards cursor', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const listMessagesPage = vi.fn().mockResolvedValue({
      messages: [{ id: 'm-1', sessionId: 's-1', role: 'user', orderSeq: 1 }],
      nextCursor: { orderSeq: 1, id: 'm-1' },
      hasMore: true
    })
    const owned = {
      id: 's-1',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    }
    const dialogue = {
      createDeepChatAgent: vi.fn(),
      updateDeepChatAgent: vi.fn(),
      listAgents: vi.fn(),
      getAgent: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn().mockResolvedValue(owned),
      listLightweight: vi.fn(),
      listMessagesPage,
      getMessage: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      searchHistory: vi.fn(),
      sendMessage: vi.fn(),
      steerActiveTurn: vi.fn(),
      cancelGeneration: vi.fn(),
      respondToolInteraction: vi.fn()
    }
    const first = await handleAppBridgeInvoke(
      deps({ getAuthSession: () => ({ token: 'tok-1' }), dialogue }),
      runtime,
      'session.get',
      { appId: 'demo-workbench', sessionId: 's-1' },
      1
    )
    expect(listMessagesPage).toHaveBeenCalledWith('s-1', { limit: 10, cursor: null })
    expect(first).toMatchObject({
      hasMore: true,
      nextCursor: { orderSeq: 1, id: 'm-1' }
    })

    await handleAppBridgeInvoke(
      deps({ getAuthSession: () => ({ token: 'tok-1' }), dialogue }),
      runtime,
      'session.get',
      {
        appId: 'demo-workbench',
        sessionId: 's-1',
        limit: 20,
        cursor: { orderSeq: 1, id: 'm-1' }
      },
      1
    )
    expect(listMessagesPage).toHaveBeenLastCalledWith('s-1', {
      limit: 20,
      cursor: { orderSeq: 1, id: 'm-1' }
    })
  })

  it('lists owned sessions 10 at a time by default', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const listLightweight = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: { updatedAt: 1, id: 's-1' },
      hasMore: true
    })
    await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight,
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.list',
      { appId: 'demo-workbench', agentId: 'ag-1' },
      1
    )
    expect(listLightweight).toHaveBeenCalledWith({
      agentId: 'ag-1',
      limit: 10,
      cursor: null,
      includeSubagents: false
    })
  })

  it('caps session.list and session.get limits at 50', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const owned = {
      id: 's-1',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    }
    const listLightweight = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false
    })
    const listMessagesPage = vi.fn().mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false
    })
    const dialogue = {
      createDeepChatAgent: vi.fn(),
      updateDeepChatAgent: vi.fn(),
      listAgents: vi.fn(),
      getAgent: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn().mockResolvedValue(owned),
      listLightweight,
      listMessagesPage,
      getMessage: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      searchHistory: vi.fn(),
      sendMessage: vi.fn(),
      steerActiveTurn: vi.fn(),
      cancelGeneration: vi.fn(),
      respondToolInteraction: vi.fn()
    }
    await handleAppBridgeInvoke(
      deps({ getAuthSession: () => ({ token: 'tok-1' }), dialogue }),
      runtime,
      'session.list',
      { appId: 'demo-workbench', agentId: 'ag-1', limit: 999 },
      1
    )
    expect(listLightweight).toHaveBeenCalledWith({
      agentId: 'ag-1',
      limit: 50,
      cursor: null,
      includeSubagents: false
    })
    await handleAppBridgeInvoke(
      deps({ getAuthSession: () => ({ token: 'tok-1' }), dialogue }),
      runtime,
      'session.get',
      { appId: 'demo-workbench', sessionId: 's-1', limit: 999 },
      1
    )
    expect(listMessagesPage).toHaveBeenCalledWith('s-1', { limit: 50, cursor: null })
  })

  it('rejects session.list without agentId', async () => {
    const listLightweight = vi.fn()
    const result = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight,
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.list',
      { appId: 'demo-workbench' },
      1
    )
    expect(result).toEqual({ code: 'VALIDATION_ERROR', message: '需要提供 agentId' })
    expect(listLightweight).not.toHaveBeenCalled()
  })

  it('pages owned sessions when checking an existing project dir', async () => {
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'ag-1'
    })
    const createSession = vi.fn().mockResolvedValue({
      id: 's-3',
      agentId: 'ag-1',
      title: 'hello',
      projectDir: '/tmp/work',
      isPinned: false,
      sessionKind: 'chat',
      orchestrationPolicy: {},
      toolModeOverride: null,
      createdAt: 1,
      updatedAt: 1,
      status: 'idle'
    })
    const listLightweight = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 's-1', agentId: 'ag-1', projectDir: '/tmp/other', updatedAt: 2 }],
        nextCursor: { updatedAt: 2, id: 's-1' },
        hasMore: true
      })
      .mockResolvedValueOnce({
        items: [{ id: 's-2', agentId: 'ag-1', projectDir: '/tmp/work/', updatedAt: 1 }],
        nextCursor: null,
        hasMore: false
      })
    const created = await handleAppBridgeInvoke(
      deps({
        getAuthSession: () => ({ token: 'tok-1' }),
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({ id: 'ag-1', name: '助手', enabled: true }),
          createSession,
          getSession: vi.fn(),
          listLightweight,
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          respondToolInteraction: vi.fn()
        }
      }),
      runtime,
      'session.create',
      {
        appId: 'demo-workbench',
        agentId: 'ag-1',
        message: 'hello',
        projectDir: '/tmp/work/'
      },
      1
    )
    expect(listLightweight).toHaveBeenCalledTimes(2)
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: '/tmp/work' }),
      1
    )
    expect(created).toMatchObject({
      session: expect.objectContaining({ id: 's-3', projectDir: '/tmp/work' })
    })
  })
})
