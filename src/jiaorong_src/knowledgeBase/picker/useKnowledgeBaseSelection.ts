import { computed, ref } from 'vue'
import type { KnowledgeBaseSelectionItem } from './types'

/** 新会话页固定 key：不随 ACP draft sessionId 变化，避免选中丢失/孤儿复活 */
export const NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY = '__new_thread__'

const selectionBySession = ref<Record<string, KnowledgeBaseSelectionItem[]>>({})

export function resolveKnowledgeBaseSessionKey(sessionId: string | null | undefined): string {
  const trimmed = sessionId?.trim()
  return trimmed ? trimmed : NEW_THREAD_KNOWLEDGE_BASE_SESSION_KEY
}

export function useKnowledgeBaseSelection(sessionId: () => string | null | undefined) {
  const sessionKey = computed(() => resolveKnowledgeBaseSessionKey(sessionId()))

  const items = computed(() => selectionBySession.value[sessionKey.value] ?? [])

  function setItems(next: KnowledgeBaseSelectionItem[]) {
    selectionBySession.value = {
      ...selectionBySession.value,
      [sessionKey.value]: next.slice()
    }
  }

  function clear() {
    setItems([])
  }

  function removeByKey(key: string) {
    setItems(items.value.filter((item) => item.key !== key))
  }

  return {
    items,
    setItems,
    clear,
    removeByKey
  }
}

/** 供页面在发送成功后与附件一并清空 */
export function clearKnowledgeBaseSelectionForSession(sessionId: string | null | undefined) {
  const key = resolveKnowledgeBaseSessionKey(sessionId)
  selectionBySession.value = {
    ...selectionBySession.value,
    [key]: []
  }
}
