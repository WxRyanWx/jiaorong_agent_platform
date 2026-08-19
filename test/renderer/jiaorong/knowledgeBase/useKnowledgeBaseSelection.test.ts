import { describe, expect, it } from 'vitest'
import {
  clearKnowledgeBaseSelectionForSession,
  NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY,
  resolveKnowledgeBaseSessionKey,
  useKnowledgeBaseSelection
} from '../../../../src/jiaorong_src/knowledgeBase/picker/useKnowledgeBaseSelection'

describe('resolveKnowledgeBaseSessionKey', () => {
  it('uses stable draft key when session id missing', () => {
    expect(resolveKnowledgeBaseSessionKey(null)).toBe(NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY)
    expect(resolveKnowledgeBaseSessionKey('')).toBe(NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY)
    expect(resolveKnowledgeBaseSessionKey('  ')).toBe(NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY)
    expect(resolveKnowledgeBaseSessionKey('s1')).toBe('s1')
  })
})

describe('useKnowledgeBaseSelection', () => {
  it('keeps new-thread selection under draft key independent of later session ids', () => {
    const draft = useKnowledgeBaseSelection(() => null)
    draft.setItems([
      {
        key: 'knowledgeBase:1',
        kind: 'knowledgeBase',
        id: '1',
        name: 'kb'
      }
    ])

    expect(draft.items.value).toHaveLength(1)

    const other = useKnowledgeBaseSelection(() => 'real-session')
    expect(other.items.value).toHaveLength(0)

    clearKnowledgeBaseSelectionForSession(null)
    expect(draft.items.value).toHaveLength(0)
  })
})
