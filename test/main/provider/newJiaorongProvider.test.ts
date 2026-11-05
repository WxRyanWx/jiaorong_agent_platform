import { describe, expect, it } from 'vitest'
import { ModelType } from '@shared/model'
import { DEFAULT_PROVIDERS } from '../../../src/main/provider/defaults'
import { mapNewJiaorongModelRecords } from '../../../src/main/provider/newJiaorongModels'
import { resolveAiSdkProviderDefinition } from '../../../src/main/provider/providerRegistry'

describe('new-jiaorong provider', () => {
  it('maps to the OpenAI-compatible transport with live model discovery', () => {
    const provider = DEFAULT_PROVIDERS.find((item) => item.id === 'new-jiaorong')

    expect(provider).toBeDefined()
    expect(resolveAiSdkProviderDefinition(provider!)).toMatchObject({
      runtimeKind: 'openai-compatible',
      behaviorPreset: 'openai',
      modelSource: 'new-jiaorong',
      checkStrategy: 'fetch-models'
    })
  })

  it('keeps only usable jrdz models and types non-chat models', () => {
    const models = mapNewJiaorongModelRecords('new-jiaorong', [
      { id: 'jrdz-dsv4.1f' },
      { id: 'jrdz-qwen3-rerank' },
      { id: 'jrdz-qwen3.7-max' },
      { id: 'jrdz-dsv4.1f' },
      { id: 'og54vm3' },
      { id: "og64r1vn'" },
      { id: '' },
      { id: 42 }
    ])

    expect(models.map((model) => [model.id, model.type])).toEqual([
      ['jrdz-dsv4.1f', ModelType.Chat],
      ['jrdz-qwen3-rerank', ModelType.Rerank],
      ['jrdz-qwen3.7-max', ModelType.Chat]
    ])
  })
})
