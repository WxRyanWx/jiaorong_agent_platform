import request from '../../api/auth/interceptors'

/** 最多缓存的图标 object URL 数；超出按 LRU 淘汰并 revoke */
const MAX_OBJECT_URL_CACHE = 64

/** key = f8s hash，value = object URL；Map 保序用于 LRU */
const objectUrlCache = new Map<string, string>()
/** 同 hash 并发只打一次请求 */
const inflightLoads = new Map<string, Promise<string | null>>()

function touchCache(f8s: string, objectUrl: string) {
  if (objectUrlCache.has(f8s)) {
    objectUrlCache.delete(f8s)
  }
  objectUrlCache.set(f8s, objectUrl)

  while (objectUrlCache.size > MAX_OBJECT_URL_CACHE) {
    const oldestKey = objectUrlCache.keys().next().value
    if (oldestKey === undefined) break
    const oldestUrl = objectUrlCache.get(oldestKey)
    objectUrlCache.delete(oldestKey)
    if (oldestUrl) {
      URL.revokeObjectURL(oldestUrl)
    }
  }
}

async function fetchIconObjectUrl(f8s: string): Promise<string | null> {
  try {
    const data = await request.get(`sys-storage/download?f8s=${encodeURIComponent(f8s)}`, {
      responseType: 'blob',
      headers: { dontShowMessage: true }
    })
    if (!(data instanceof Blob) || data.size === 0) {
      return null
    }
    // 后端偶发用 JSON 包错误
    if (data.type.includes('application/json')) {
      return null
    }
    const objectUrl = URL.createObjectURL(data)
    touchCache(f8s, objectUrl)
    return objectUrl
  } catch {
    return null
  }
}

/**
 * 带 Fusion-Auth 拉取图标为 object URL（img 无法带请求头）。
 * 失败返回 null，由 UI 回退默认图。
 */
export async function loadKnowledgeBaseIconObjectUrl(
  icon: string | null | undefined
): Promise<string | null> {
  const f8s = icon?.trim()
  if (!f8s) return null

  const cached = objectUrlCache.get(f8s)
  if (cached) {
    touchCache(f8s, cached)
    return cached
  }

  const inflight = inflightLoads.get(f8s)
  if (inflight) return inflight

  const pending = fetchIconObjectUrl(f8s).finally(() => {
    inflightLoads.delete(f8s)
  })
  inflightLoads.set(f8s, pending)
  return pending
}

/** 测试 / 登出时可清空并释放全部 object URL */
export function clearKnowledgeBaseIconObjectUrlCache() {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  objectUrlCache.clear()
  inflightLoads.clear()
}
