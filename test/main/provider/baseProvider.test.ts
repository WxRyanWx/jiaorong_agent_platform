import type { ProviderSettingsPort } from '@/provider/settings'
import { JIAORONG_DEFAULT_MODEL_ID } from '@jiaorong/brand'
import { describe, expect, it, vi } from 'vitest'
import type { LLM_PROVIDER, MODEL_META, ModelConfig } from '@shared/types/provider'
import { TOOL_EXECUTION, type MCPToolDefinition } from '@shared/types/mcp'
import type { ChatMessage } from '@shared/types/core/chat-message'
import type { LLMResponse } from '@shared/types/provider'
import { BaseLLMProvider } from '../../../src/main/provider/baseProvider'

class TestProvider extends BaseLLMProvider {
  constructor(
    providerSettings: ProviderSettingsPort,
    private readonly modelFetcher: () => Promise<MODEL_META[]> = async () => [],
    private readonly retryDelays: readonly number[] = [0, 0]
  ) {
    super(
      {
        id: 'test-provider',
        name: 'Test Provider',
        enable: true,
        apiKey: 'test-key',
        apiHost: '',
        apiVersion: '',
        models: []
      } as unknown as LLM_PROVIDER,
      providerSettings
    )
  }

  public renderToolsXml(tools: MCPToolDefinition[]): string {
    return this.convertToolsToXml(tools)
  }

  public getProviderSnapshot(): LLM_PROVIDER {
    return this.provider
  }

  public createRequestSignal(timeout: number | undefined, signal?: AbortSignal) {
    return this.createModelRequestSignal(timeout ? { timeout } : undefined, signal)
  }

  public onProxyResolved(): void {}

  public async check(): Promise<{ isOk: boolean; errorMsg: string | null }> {
    return { isOk: true, errorMsg: null }
  }

  public async summaryTitles(_messages: ChatMessage[], _modelId: string): Promise<string> {
    return 'summary'
  }

  public async completions(
    _messages: ChatMessage[],
    _modelId: string,
    _temperature?: number,
    _maxTokens?: number,
    _tools?: MCPToolDefinition[]
  ): Promise<LLMResponse> {
    return { content: 'ok' }
  }

  public async summaries(
    _text: string,
    _modelId: string,
    _temperature?: number,
    _maxTokens?: number
  ): Promise<LLMResponse> {
    return { content: 'ok' }
  }

  public async generateText(
    _prompt: string,
    _modelId: string,
    _temperature?: number,
    _maxTokens?: number
  ): Promise<LLMResponse> {
    return { content: 'ok' }
  }

  public async *coreStream(
    _messages: ChatMessage[],
    _modelId: string,
    _modelConfig: ModelConfig,
    _temperature: number,
    _maxTokens: number,
    _tools: MCPToolDefinition[]
  ) {
    return
  }

  protected async fetchProviderModels(): Promise<MODEL_META[]> {
    return this.modelFetcher()
  }

  protected override getInitialModelFetchRetryDelays(): readonly number[] {
    return this.retryDelays
  }

  public startInit(): Promise<void> {
    return this.init()
  }
}

describe('BaseLLMProvider tool XML conversion', () => {
  const providerSettings = {
    getProviderModels: vi.fn().mockReturnValue([]),
    getCustomModels: vi.fn().mockReturnValue([]),
    getLanguage: vi.fn().mockReturnValue('zh-CN'),
    setProviderModels: vi.fn(),
    getModelStatus: vi.fn().mockReturnValue(false),
    updateCustomModel: vi.fn()
  } as unknown as ProviderSettingsPort

  it('normalizes discriminated union tool schemas before building XML', () => {
    const provider = new TestProvider(providerSettings)
    const tools: MCPToolDefinition[] = [
      {
        execution: TOOL_EXECUTION.write,
        type: 'function',
        function: {
          name: 'skill_manage',
          description: 'Manage draft skills',
          parameters: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  action: { type: 'string', const: 'create' },
                  content: { type: 'string', description: 'Draft content' }
                },
                required: ['action', 'content'],
                additionalProperties: false
              },
              {
                type: 'object',
                properties: {
                  action: { type: 'string', const: 'edit' },
                  draftId: { type: 'string', description: 'Draft ID' },
                  content: { type: 'string', description: 'Draft content' }
                },
                required: ['action', 'draftId', 'content'],
                additionalProperties: false
              }
            ]
          } as unknown as MCPToolDefinition['function']['parameters']
        },
        server: {
          name: 'deepchat',
          icons: 'tool',
          description: 'DeepChat tools'
        }
      }
    ]

    const xml = provider.renderToolsXml(tools)

    expect(xml).toContain('<tool name="skill_manage" description="Manage draft skills">')
    expect(xml).toContain('<parameter name="action" required="true" type="string"></parameter>')
    expect(xml).toContain(
      '<parameter name="content" required="true" description="Draft content" type="string"></parameter>'
    )
    expect(xml).toContain(
      '<parameter name="draftId" description="Draft ID" type="string"></parameter>'
    )
  })

  it('keeps tools without properties renderable', () => {
    const provider = new TestProvider(providerSettings)
    const xml = provider.renderToolsXml([
      {
        execution: TOOL_EXECUTION.write,
        type: 'function',
        function: {
          name: 'noop',
          description: 'No arguments tool',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        server: {
          name: 'deepchat',
          icons: 'tool',
          description: 'DeepChat tools'
        }
      }
    ])

    expect(xml).toContain('<tool name="noop" description="No arguments tool"></tool>')
  })

  it('escapes XML-sensitive characters in parameter descriptions', () => {
    const provider = new TestProvider(providerSettings)
    const xml = provider.renderToolsXml([
      {
        execution: TOOL_EXECUTION.write,
        type: 'function',
        function: {
          name: 'escape_test',
          description: 'Escape test',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'He said "hi" & used <tag> > output'
              }
            }
          }
        },
        server: {
          name: 'deepchat',
          icons: 'tool',
          description: 'DeepChat tools'
        }
      }
    ])

    expect(xml).toContain('description="He said &quot;hi&quot; &amp; used &lt;tag&gt; &gt; output"')
  })

  it('updates the provider config through the default implementation', () => {
    const provider = new TestProvider(providerSettings)

    provider.updateConfig({
      ...provider.getProviderSnapshot(),
      apiKey: 'updated-key',
      baseUrl: 'https://example.com'
    } as unknown as LLM_PROVIDER)

    expect(provider.getProviderSnapshot()).toEqual(
      expect.objectContaining({
        apiKey: 'updated-key',
        baseUrl: 'https://example.com'
      })
    )
  })

  it('suppresses asynchronous model fetch failures by default', async () => {
    const provider = new TestProvider(providerSettings, async () => {
      throw new Error('model endpoint returned 404')
    })

    await expect(provider.fetchModels()).resolves.toEqual([])
  })

  it('rethrows asynchronous model fetch failures when suppression is disabled', async () => {
    const provider = new TestProvider(providerSettings, async () => {
      throw new Error('model endpoint returned 404')
    })

    await expect(provider.fetchModels({ suppressErrors: false })).rejects.toThrow(
      'model endpoint returned 404'
    )
  })

  it('does not suppress provider model persistence failures', async () => {
    const persistenceError = new Error('model persistence failed')
    const failingProviderSettings = {
      ...providerSettings,
      setProviderModels: vi.fn(() => {
        throw persistenceError
      })
    } as unknown as ProviderSettingsPort
    const provider = new TestProvider(failingProviderSettings, async () => [
      {
        id: 'model-1',
        name: 'Model 1',
        providerId: 'test-provider',
        group: 'default'
      } as MODEL_META
    ])

    await expect(provider.fetchModels()).rejects.toThrow('model persistence failed')
  })

  it('preserves the caller signal identity when no model timeout is configured', () => {
    const provider = new TestProvider(providerSettings)
    const caller = new AbortController()
    const request = provider.createRequestSignal(undefined, caller.signal)

    expect(request.signal).toBe(caller.signal)
    request.dispose()
  })

  it('keeps caller cancellation as the first reason and disposes the model timeout', () => {
    vi.useFakeTimers()
    try {
      const provider = new TestProvider(providerSettings)
      const caller = new AbortController()
      const reason = new DOMException('caller cancelled', 'AbortError')
      const request = provider.createRequestSignal(25, caller.signal)

      caller.abort(reason)

      expect(request.signal?.aborted).toBe(true)
      expect(request.signal?.reason).toBe(reason)
      request.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses an already-aborted caller as the combined request reason', () => {
    vi.useFakeTimers()
    try {
      const provider = new TestProvider(providerSettings)
      const caller = new AbortController()
      const reason = new DOMException('already cancelled', 'AbortError')
      caller.abort(reason)

      const request = provider.createRequestSignal(25, caller.signal)

      expect(request.signal?.aborted).toBe(true)
      expect(request.signal?.reason).toBe(reason)
      request.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the model timeout as the first reason when the caller aborts later', async () => {
    vi.useFakeTimers()
    try {
      const provider = new TestProvider(providerSettings)
      const caller = new AbortController()
      const request = provider.createRequestSignal(25, caller.signal)

      await vi.advanceTimersByTimeAsync(25)
      const timeoutReason = request.signal?.reason
      caller.abort(new DOMException('late caller cancellation', 'AbortError'))

      expect(timeoutReason).toMatchObject({
        name: 'AbortError',
        message: 'Request timed out after 25ms'
      })
      expect(request.signal?.reason).toBe(timeoutReason)
      request.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up timer and caller listener when request signal ownership is disposed', async () => {
    vi.useFakeTimers()
    try {
      const provider = new TestProvider(providerSettings)
      const caller = new AbortController()
      const request = provider.createRequestSignal(25, caller.signal)

      request.dispose()
      caller.abort(new DOMException('disposed caller', 'AbortError'))
      await vi.advanceTimersByTimeAsync(25)

      expect(request.signal?.aborted).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('BaseLLMProvider initial model fetch', () => {
  const statusKey = (modelId: string) => `test-provider:${modelId}`

  const createSettings = (initialStatus: Record<string, boolean> = {}) => {
    const events: string[] = []
    const status = new Map(
      Object.entries(initialStatus).map(([modelId, enabled]) => [statusKey(modelId), enabled])
    )
    const settings = {
      events,
      status,
      getProviderModels: vi.fn().mockReturnValue([]),
      getCustomModels: vi.fn().mockReturnValue([]),
      getLanguage: vi.fn().mockReturnValue('zh-CN'),
      getModelStatus: vi.fn(
        (_providerId: string, modelId: string) => status.get(statusKey(modelId)) ?? false
      ),
      setProviderModels: vi.fn(() => {
        events.push('store')
      }),
      setModelStatus: vi.fn((_providerId: string, modelId: string, enabled: boolean) => {
        status.set(statusKey(modelId), enabled)
        events.push('enable')
      }),
      ensureModelStatus: vi.fn((_providerId: string, modelId: string, enabled: boolean) => {
        if (status.has(statusKey(modelId))) return
        status.set(statusKey(modelId), enabled)
        events.push('ensure-enable')
      }),
      notifyModelsChanged: vi.fn(() => {
        events.push('notify')
      }),
      updateCustomModel: vi.fn()
    }
    return settings
  }

  const model = {
    id: JIAORONG_DEFAULT_MODEL_ID,
    name: JIAORONG_DEFAULT_MODEL_ID,
    providerId: 'test-provider',
    group: 'default'
  } as MODEL_META

  const otherModel = {
    id: 'server-chat-model',
    name: 'server-chat-model',
    providerId: 'test-provider',
    group: 'default'
  } as MODEL_META

  it('notifies the chat after storing and enabling models from the startup fetch', async () => {
    const settings = createSettings()
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, async () => [
      model
    ])

    await provider.startInit()

    expect(settings.events).toEqual(['store', 'enable', 'notify'])
    expect(settings.notifyModelsChanged).toHaveBeenCalledWith('test-provider')
    expect(settings.setModelStatus).toHaveBeenCalledWith(
      'test-provider',
      JIAORONG_DEFAULT_MODEL_ID,
      true
    )
  })

  it('notifies even when the fetched catalog is empty', async () => {
    const settings = createSettings()
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, async () => [])

    await provider.startInit()

    expect(settings.setProviderModels).toHaveBeenCalledWith('test-provider', [])
    expect(settings.notifyModelsChanged).toHaveBeenCalledWith('test-provider')
  })

  it('retries a failed startup fetch and stops without notifying', async () => {
    const settings = createSettings()
    const fetcher = vi.fn().mockRejectedValue(new Error('missing api key'))
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, fetcher)

    await expect(provider.startInit()).resolves.toBeUndefined()

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(settings.setProviderModels).not.toHaveBeenCalled()
    expect(settings.notifyModelsChanged).not.toHaveBeenCalled()
  })

  it('notifies once when a retry succeeds after a failed attempt', async () => {
    const settings = createSettings()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('502')).mockResolvedValue([model])
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, fetcher)

    await provider.startInit()

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(settings.events).toEqual(['store', 'enable', 'notify'])
  })

  it('enables a chat model when the catalog has no default model', async () => {
    const settings = createSettings()
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, async () => [
      otherModel
    ])

    await provider.startInit()

    expect(settings.setModelStatus).not.toHaveBeenCalled()
    expect(settings.ensureModelStatus).toHaveBeenCalledWith(
      'test-provider',
      'server-chat-model',
      true
    )
    expect(settings.status.get('test-provider:server-chat-model')).toBe(true)
    expect(settings.events).toEqual(['store', 'ensure-enable', 'notify'])
  })

  it('keeps a model disabled when the user already turned it off', async () => {
    const settings = createSettings({ 'server-chat-model': false })
    const provider = new TestProvider(settings as unknown as ProviderSettingsPort, async () => [
      otherModel
    ])

    await provider.startInit()

    expect(settings.getModelStatus).toHaveBeenCalledWith('test-provider', 'server-chat-model')
    expect(settings.status.get('test-provider:server-chat-model')).toBe(false)
  })
})
