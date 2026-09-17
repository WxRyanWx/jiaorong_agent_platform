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

/**
 * 按文件扩展名猜 MIME。
 * @param filePath 磁盘文件完整路径
 */
function mimeTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    // 页面入口
    case '.html':
    case '.htm':
      return 'text/html'
    // 样式表
    case '.css':
      return 'text/css'
    // 脚本
    case '.js':
    case '.mjs':
      return 'text/javascript'
    // JSON 与 sourcemap
    case '.json':
    case '.map':
      return 'application/json'
    // 矢量图
    case '.svg':
      return 'image/svg+xml'
    // 位图
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
    // 字体
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    // 未知类型按二进制流下发
    default:
      return 'application/octet-stream'
  }
}

/**
 * 把请求路径解析到应用目录内，阻止目录穿越与符号链接逃逸。
 * @param rootPath 应用根目录
 * @param targetPath 待校验的目标路径
 */
function resolveInsideRoot(rootPath: string, targetPath: string): string | null {
  // 目标不存在
  if (!fs.existsSync(targetPath)) return null
  try {
    /** 应用目录 realpath。 */
    const rootReal = fs.realpathSync(rootPath)
    /** 目标文件 realpath。 */
    const targetReal = fs.realpathSync(targetPath)
    // 解析符号链接后仍必须在应用目录内
    if (!isPathInsideRoot(rootReal, targetReal)) return null
    // 只允许普通文件，不返回目录或设备节点
    if (!fs.statSync(targetReal).isFile()) return null
    return targetReal
  } catch {
    // realpath / stat 抛错，按不可访问处理
    return null
  }
}

/**
 * 按协议提供应用静态文件。
 * @param expectedAppId 该 partition 绑定的应用 id
 * @param requestUrl 请求完整 URL
 */
async function serveAppFile(expectedAppId: string, requestUrl: string): Promise<Response> {
  // 依赖尚未注册（启动顺序问题）
  if (!protocolDeps) return new Response('Not found', { status: 404 })
  /** URL。 */
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    // URL 非法
    return new Response('Bad request', { status: 400 })
  }
  /** 当前应用 id。 */
  const appId = url.hostname.trim()
  // hostname 必须等于本 partition 绑定的应用，防止跨应用读文件
  if (!appId || appId !== expectedAppId) return new Response('Forbidden', { status: 403 })

  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(protocolDeps.getAuthSession())
  /** 当前应用运行时。 */
  const runtime = scanJiaorongApps(user).find((item) => item.id === appId && item.visible)
  // 未安装、当前用户不可见或没有安装目录
  if (!runtime?.appDir) return new Response('Not found', { status: 404 })

  /** 相对请求路径。 */
  let relativeRequest = ''
  try {
    // 解码后去掉前导斜杠，统一成相对路径
    relativeRequest = decodeURIComponent(url.pathname || '').replace(/^[/\\]+/, '')
  } catch {
    // 百分号编码非法
    return new Response('Bad request', { status: 400 })
  }
  /** relativePath 路径。 */
  const relativePath = relativeRequest || runtime.entry || 'web-ui/index.html'
  /** 选中文件的完整路径。 */
  const fullPath = path.resolve(runtime.appDir, relativePath)
  /** 解析后的文件路径。 */
  const resolved = resolveInsideRoot(runtime.appDir, fullPath)
  // 越界、不存在或不是普通文件
  if (!resolved) return new Response('Not found', { status: 404 })

  /** 响应/请求体。 */
  const body = await fsp.readFile(resolved)
  return new Response(body, {
    status: 200,
    headers: {
      // 按扩展名给 MIME
      'content-type': mimeTypeForPath(resolved),
      // 应用可能被更新，不做缓存
      'cache-control': 'no-cache'
    }
  })
}

/**
 * 给 session 挂 jiaorong-app 协议。
 * @param partition guest 分区
 * @param appId 该分区绑定的应用 id
 */
function attachProtocolHandler(partition: string, appId: string): void {
  // 同一 partition 只挂一次
  if (attachedPartitions.has(partition)) return
  /** Electron session。 */
  const sess = electronSession.fromPartition(partition)
  // 协议请求全部转给 serveAppFile，并把 appId 锁死
  sess.protocol.handle(JIAORONG_APP_PROTOCOL, (request) => serveAppFile(appId, request.url))
  attachedPartitions.add(partition)
}

/** 注册特权 scheme。 */
export function registerJiaorongAppSchemes(): void {
  // 幂等：app ready 前只能注册一次
  if (schemesRegistered) return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: JIAORONG_APP_PROTOCOL,
      privileges: {
        // 支持 hostname / pathname 解析
        standard: true,
        // 视作安全源，允许 localStorage 等能力
        secure: true,
        // 允许页面内 fetch 本协议
        supportFetchAPI: true,
        // 允许跨源请求
        corsEnabled: true,
        // 支持流式响应
        stream: true
      }
    }
  ])
  schemesRegistered = true
}

/**
 * 确保默认 session 已挂协议。
 * @param appId 要打开的应用 id
 * @returns 该应用使用的 partition
 */
export function ensureJiaorongAppProtocolSession(appId: string): string {
  /** Electron session partition。 */
  const partition = guestPartitionForApp(appId)
  // 首次打开时挂协议，之后复用
  attachProtocolHandler(partition, appId)
  return partition
}

/**
 * 注册协议处理器（幂等）。
 * @param deps 超级智能体依赖，协议里用来读登录态
 */
export function registerJiaorongAppProtocolHandler(deps: JiaorongAppHostDeps): void {
  protocolDeps = deps
}
