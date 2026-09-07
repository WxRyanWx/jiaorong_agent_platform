import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { protocol, session as electronSession } from 'electron'
import { JIAORONG_APP_PROTOCOL } from '../channels'
import { guestPartitionForApp } from './guestAppId'
import { isPathInsideRoot } from './paths'
import { scanJiaorongApps } from './scan'
import { readUserIdentityFromAuthSession } from './userIdentity'
import type { JiaorongAppHostDeps } from './deps'

let schemesRegistered = false
let protocolDeps: JiaorongAppHostDeps | null = null
const attachedPartitions = new Set<string>()

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

function resolveInsideRoot(rootPath: string, targetPath: string): string | null {
  if (!fs.existsSync(targetPath)) return null
  try {
    const rootReal = fs.realpathSync(rootPath)
    const targetReal = fs.realpathSync(targetPath)
    if (!isPathInsideRoot(rootReal, targetReal)) return null
    if (!fs.statSync(targetReal).isFile()) return null
    return targetReal
  } catch {
    return null
  }
}

async function serveAppFile(expectedAppId: string, requestUrl: string): Promise<Response> {
  if (!protocolDeps) return new Response('Not found', { status: 404 })
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const appId = url.hostname.trim()
  if (!appId || appId !== expectedAppId) return new Response('Forbidden', { status: 403 })

  const user = readUserIdentityFromAuthSession(protocolDeps.getAuthSession())
  const runtime = scanJiaorongApps(user).find((item) => item.id === appId && item.visible)
  if (!runtime?.appDir) return new Response('Not found', { status: 404 })

  let relativeRequest = ''
  try {
    relativeRequest = decodeURIComponent(url.pathname || '').replace(/^[/\\]+/, '')
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const relativePath = relativeRequest || runtime.entry || 'web-ui/index.html'
  const fullPath = path.resolve(runtime.appDir, relativePath)
  const resolved = resolveInsideRoot(runtime.appDir, fullPath)
  if (!resolved) return new Response('Not found', { status: 404 })

  const body = await fsp.readFile(resolved)
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': mimeTypeForPath(resolved),
      'cache-control': 'no-cache'
    }
  })
}

function attachProtocolHandler(partition: string, appId: string): void {
  if (attachedPartitions.has(partition)) return
  const sess = electronSession.fromPartition(partition)
  sess.protocol.handle(JIAORONG_APP_PROTOCOL, (request) => serveAppFile(appId, request.url))
  attachedPartitions.add(partition)
}

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

export function ensureJiaorongAppProtocolSession(appId: string): string {
  const partition = guestPartitionForApp(appId)
  attachProtocolHandler(partition, appId)
  return partition
}

export function registerJiaorongAppProtocolHandler(deps: JiaorongAppHostDeps): void {
  protocolDeps = deps
}
