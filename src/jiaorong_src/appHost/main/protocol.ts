/** jiaorong-app:// 协议：按 appId 映射到安装目录文件。 */

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { protocol, session as electronSession } from 'electron'
import { JIAORONG_APP_PROTOCOL } from '../channels'
import { guestPartitionForApp } from './guest'
import { isPathInsideRoot } from './paths'
import { scanJiaorongApps } from './scan'
import { readUserIdentityFromAuthSession } from './userIdentity'
import type { JiaorongAppHostDeps } from './deps'

/** 特权 scheme 是否已注册。 */
let schemesRegistered = false
/** 协议处理依赖。 */
let protocolDeps: JiaorongAppHostDeps | null = null
/** 已挂协议的 partition。 */
const attachedPartitions = new Set<string>()

/** 按文件扩展名猜 MIME。 */
function mimeTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
    case '.htm':
      return 'text/html'
    case '.css':
      return 'text/css'
    case '.js':
    case '.mjs':
      return 'text/javascript'
    case '.json':
    case '.map':
      return 'application/json'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    default:
      return 'application/octet-stream'
  }
}

/** 把请求路径解析到应用目录内。 */
function resolveInsideRoot(rootPath: string, targetPath: string): string | null {
  if (!fs.existsSync(targetPath)) return null
  try {
    /** 应用目录 realpath。 */
    const rootReal = fs.realpathSync(rootPath)
    /** 目标文件 realpath。 */
    const targetReal = fs.realpathSync(targetPath)
    if (!isPathInsideRoot(rootReal, targetReal)) return null
    if (!fs.statSync(targetReal).isFile()) return null
    return targetReal
  } catch {
    return null
  }
}

/** 按协议提供应用静态文件。 */
async function serveAppFile(expectedAppId: string, requestUrl: string): Promise<Response> {
  if (!protocolDeps) return new Response('Not found', { status: 404 })
  /** URL。 */
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  /** 当前应用 id。 */
  const appId = url.hostname.trim()
  if (!appId || appId !== expectedAppId) return new Response('Forbidden', { status: 403 })

  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(protocolDeps.getAuthSession())
  /** 当前应用运行时。 */
  const runtime = scanJiaorongApps(user).find((item) => item.id === appId && item.visible)
  if (!runtime?.appDir) return new Response('Not found', { status: 404 })

  /** 相对请求路径。 */
  let relativeRequest = ''
  try {
    relativeRequest = decodeURIComponent(url.pathname || '').replace(/^[/\\]+/, '')
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  /** relativePath 路径。 */
  const relativePath = relativeRequest || runtime.entry || 'web-ui/index.html'
  /** 选中文件的完整路径。 */
  const fullPath = path.resolve(runtime.appDir, relativePath)
  /** 解析后的文件路径。 */
  const resolved = resolveInsideRoot(runtime.appDir, fullPath)
  if (!resolved) return new Response('Not found', { status: 404 })

  /** 响应/请求体。 */
  const body = await fsp.readFile(resolved)
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': mimeTypeForPath(resolved),
      'cache-control': 'no-cache'
    }
  })
}

/** 给 session 挂 jiaorong-app 协议。 */
function attachProtocolHandler(partition: string, appId: string): void {
  if (attachedPartitions.has(partition)) return
  /** Electron session。 */
  const sess = electronSession.fromPartition(partition)
  sess.protocol.handle(JIAORONG_APP_PROTOCOL, (request) => serveAppFile(appId, request.url))
  attachedPartitions.add(partition)
}

/** 注册特权 scheme。 */
export function registerJiaorongAppSchemes(): void {
  if (schemesRegistered) return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: JIAORONG_APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
  schemesRegistered = true
}

/** 确保默认 session 已挂协议。 */
export function ensureJiaorongAppProtocolSession(appId: string): string {
  /** Electron session partition。 */
  const partition = guestPartitionForApp(appId)
  attachProtocolHandler(partition, appId)
  return partition
}

/** 注册协议处理器（幂等）。 */
export function registerJiaorongAppProtocolHandler(deps: JiaorongAppHostDeps): void {
  protocolDeps = deps
}
