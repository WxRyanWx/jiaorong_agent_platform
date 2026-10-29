/** 应用目录接口同步：登录后异步拉取，不阻塞主进程启动。 */

import { resolveAuthApiBaseUrl, resolveAuthProductId } from '../../api/auth/config'
import { applyAppCatalogFromApi } from '../catalog'
import type { JiaorongAppHostDeps } from './deps'
import { readAuthToken } from './userIdentity'

const PAGE_SIZE = 100
const MAX_PAGES = 20
const FETCH_TIMEOUT_MS = 8_000

type AssetsPage = {
  items: unknown[]
  hasMore: boolean
}

/** 一次目录同步的结果：失败时不能当作「目录为空」。 */
export type AppCatalogSyncResult = {
  /** 接口是否成功返回（失败保留旧快照，等重试） */
  ok: boolean
  /** 目录内容是否发生变化 */
  changed: boolean
}

/** 同一登录态下只跑一条同步；token 变化时不能复用上一条，否则会拿旧账号的目录覆盖。 */
let inflight: { token: string; promise: Promise<AppCatalogSyncResult> } | null = null

/**
 * 拉一页应用资产。
 * @param token 登录 token
 * @param page 页码
 */
async function fetchAppPage(token: string, page: number): Promise<AssetsPage | null> {
  const url = `${resolveAuthApiBaseUrl()}/deepchat-ext/assets?type=app&scope=market&page=${page}&pageSize=${PAGE_SIZE}`
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Fusion-Auth': token,
        'Product-Id': resolveAuthProductId()
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      code?: unknown
      data?: { items?: unknown; hasMore?: unknown } | null
    }
    // 业务码统一按数值比较，兼容后端偶尔返回字符串 "200"
    if (Number(body.code) !== 200) return null
    return {
      items: Array.isArray(body.data?.items) ? body.data.items : [],
      hasMore: body.data?.hasMore === true
    }
  } catch (error) {
    console.warn('[jiaorong-app] app catalog fetch failed', error)
    return null
  }
}

/**
 * 拉全量应用列表并覆盖运行时目录。
 * 失败保留上一次成功快照；未登录时清空，避免上一个账号的应用残留。
 * @param deps 超级智能体依赖（读登录态）
 * @returns 同步结果（ok 区分「失败」与「目录为空」）
 */
async function runSync(deps: JiaorongAppHostDeps, token: string): Promise<AppCatalogSyncResult> {
  if (!token) {
    // 等待期间已登录：不要用「未登录」的空目录覆盖新账号快照
    if ((readAuthToken(deps.getAuthSession()) ?? '') !== '') {
      return { ok: false, changed: false }
    }
    return { ok: true, changed: applyAppCatalogFromApi([]) }
  }

  const items: unknown[] = []
  /** 最后一页是否仍声明还有下一页；为 true 说明翻到了上限。 */
  let hasMore = false
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchAppPage(token, page)
    // 任一页失败都不要用半份数据覆盖已有目录
    if (!result) return { ok: false, changed: false }
    items.push(...result.items)
    hasMore = result.hasMore
    if (!hasMore) break
  }
  // 翻到上限仍 hasMore：后端分页异常或数据量超出设计上限。
  // 返回失败保留上一份完整快照，避免用截断的目录把后面的应用判成「已下架」。
  if (hasMore) {
    console.warn('[jiaorong-app] app catalog exceeded page limit, keep previous snapshot')
    return { ok: false, changed: false }
  }
  // 拉取期间切换了账号：这份结果属于上一个登录态，不能覆盖当前目录
  if ((readAuthToken(deps.getAuthSession()) ?? '') !== token) {
    return { ok: false, changed: false }
  }
  return { ok: true, changed: applyAppCatalogFromApi(items) }
}

/**
 * 后台同步应用目录；并发调用复用同一次任务。
 * @param deps 超级智能体依赖
 */
export function syncAppCatalogFromApi(deps: JiaorongAppHostDeps): Promise<AppCatalogSyncResult> {
  const token = readAuthToken(deps.getAuthSession()) ?? ''
  if (inflight && inflight.token === token) return inflight.promise
  const promise = runSync(deps, token).finally(() => {
    if (inflight?.promise === promise) inflight = null
  })
  inflight = { token, promise }
  return promise
}
