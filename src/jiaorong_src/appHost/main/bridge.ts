/** 分发 window.jiaorong invoke：上下文、对话框、目录、知识库、对话。 */

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { BrowserWindow, clipboard, dialog, nativeImage, webContents } from 'electron'
import { isJiaorongBridgeFailure, toJiaorongBridgeInvokeFailure } from '../bridgeErrors'
import type { JiaorongAppOpenInfo, JiaorongAppRuntime, JiaorongMenuAppItem } from '../types'
import { buildHostContext } from './context'
import { handleDialogueInvoke } from './dialogue'
import type { JiaorongAppHostDeps } from './deps'
import {
  buildJiaorongAppEntryUrl,
  getBoundGuestAppId,
  hasPickedDirectory,
  isAbsoluteGuestPath,
  isGuestPathAllowed,
  isLoopbackHttpEntry,
  rememberPickedDirectory
} from './guest'
import { appAgentIds } from './agentMap'
import { queryJiaorongKnowledgeBaseDirectory, queryJiaorongKnowledgeBases } from './knowledgeBase'
import { getAppPreloadFileUrl, isPathInsideRoot } from './paths'
import { ensureJiaorongAppProtocolSession } from './protocol'
import { buildJiaorongSlashCatalog } from './slashCatalog'
import { buildUserInfoPayload, readAuthToken } from './userIdentity'

/**
 * 在 guest 窗口上弹出系统文件/目录对话框。
 * @param webContentsId 发起调用的 guest WebContents id
 * @param options 系统对话框选项
 */
async function openGuestDialog(
  webContentsId: number,
  options: Electron.OpenDialogOptions
): Promise<string[]> {
  /** Electron webContents。 */
  const contents = webContents.fromId(webContentsId)
  /** 所属 BrowserWindow。 */
  const win = contents ? BrowserWindow.fromWebContents(contents) : null
  /** 对话框选中结果。 */
  const picked = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  // 用户取消
  if (picked.canceled) return []
  // 过滤掉空路径
  return picked.filePaths.filter((filePath) => Boolean(filePath?.trim()))
}

/**
 * 找到该应用 guest 页的 webContents。
 * @param appId 应用 id
 * @param preferredWebContentsId 优先使用的 WebContents id
 */
function findGuestPageWebContents(appId: string, preferredWebContentsId: number) {
  /** 优先使用的 webContents。 */
  const preferred = webContents.fromId(preferredWebContentsId)
  // 调用方自己就是本应用页面，直接用
  if (preferred && !preferred.isDestroyed() && getBoundGuestAppId(preferred.id) === appId) {
    return preferred
  }
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    // 跳过已销毁的
    if (contents.isDestroyed()) continue
    // 不是本应用的 guest
    if (getBoundGuestAppId(contents.id) !== appId) continue
    return contents
  }
  // 没找到本应用页面
  return null
}

/**
 * 运行时转成侧栏菜单项；图标必须落在应用目录内才给 file:// URL。
 * @param runtime 应用运行时项
 */
/**
 * 解析应用图标为 file:// URL；越界或文件缺失返回 null。
 * @param runtime 运行时项
 */
export function resolveAppIconSrc(runtime: JiaorongAppRuntime): string | null {
  /** 应用安装目录。 */
  const appDir = runtime.appDir
  /** 图标文件绝对路径。 */
  const iconFile = runtime.icon && appDir ? path.resolve(appDir, runtime.icon) : null
  // 校验通过后的 file:// 图标 URL；否则 null
  return iconFile &&
    appDir &&
    isPathInsideRoot(path.resolve(appDir), iconFile) &&
    fs.existsSync(iconFile)
    ? pathToFileURL(iconFile).href
    : null
}

export function toMenuAppItem(runtime: JiaorongAppRuntime): JiaorongMenuAppItem {
  // 只透出侧栏需要的字段
  return {
    id: runtime.id,
    name: runtime.name,
    version: runtime.version,
    installStatus: runtime.installStatus,
    iconSrc: resolveAppIconSrc(runtime)
  }
}

/**
 * 运行时转成打开 webview 所需信息。
 * @param runtime 应用运行时项
 */
export function toOpenInfo(runtime: JiaorongAppRuntime): JiaorongAppOpenInfo | null {
  // 没装到磁盘或没有入口
  if (!runtime.appDir || !runtime.entry) return null
  /** 目录或列表一项。 */
  const entry = runtime.entry.trim()
  // 入口是空白串
  if (!entry) return null
  /** Electron session partition。 */
  const partition = ensureJiaorongAppProtocolSession(runtime.id)
  /** guest preload 地址。 */
  const preload = getAppPreloadFileUrl()
  // 开发态允许直接连本机 http 服务
  if (isLoopbackHttpEntry(entry)) {
    return {
      appId: runtime.id,
      src: entry,
      preload,
      partition
    }
  }
  // 其它带 scheme 的入口（http/https/file 等）一律拒绝
  if (/^[a-z][a-z0-9+.-]*:/i.test(entry)) return null
  // 常规包：走自定义协议加载
  return {
    appId: runtime.id,
    src: buildJiaorongAppEntryUrl(runtime.id, entry),
    preload,
    partition
  }
}

/**
 * 分发一条 window.jiaorong invoke。appId 必须与当前 guest 绑定一致。
 * @param deps 超级智能体依赖
 * @param runtime 当前应用运行时项
 * @param method 桥方法名
 * @param args 方法入参
 * @param webContentsId 发起调用的 guest WebContents id
 */
export async function handleAppBridgeInvoke(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime,
  method: string,
  args: unknown,
  webContentsId: number
): Promise<unknown> {
  /** 对象形态的入参。 */
  const record = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  /** 当前应用 id。 */
  const appId = typeof record.appId === 'string' ? record.appId.trim() : runtime.id
  // 越权：拿别的应用 id 调本应用的桥
  if (appId !== runtime.id) {
    return { code: 'FORBIDDEN', message: 'appId 与当前打开的应用不一致' }
  }

  try {
    // 按方法名分发；未命中的走 default 交给对话桥
    switch (method) {
      // 应用目录与登录态
      case 'context.get':
        return buildHostContext(deps, runtime)
      // 当前用户信息
      case 'userinfo.get':
        return buildUserInfoPayload(deps.getAuthSession())
      // 断开本页桥，客户端侧无状态需要清
      case 'disconnect':
        return { ok: true }
      // 打开本应用页面的 DevTools
      case 'devtools.open': {
        /** Electron webContents。 */
        const contents = findGuestPageWebContents(runtime.id, webContentsId)
        // 页面已关闭或找不到
        if (!contents) {
          return { code: 'FORBIDDEN', message: '找不到本应用页面，请从侧栏打开后再打开调试器' }
        }
        // 独立窗口，避免挤压应用页面
        contents.openDevTools({ mode: 'detach' })
        return { ok: true }
      }
      // 选目录，并把选中目录记进授权表
      case 'dialog.selectDirectory': {
        /** 对话框选中结果。 */
        const picked = await openGuestDialog(webContentsId, {
          properties: ['openDirectory', 'createDirectory']
        })
        // 用户取消或没选到
        if (!picked[0]) return { path: null }
        rememberPickedDirectory(webContentsId, picked[0])
        return { path: picked[0] }
      }
      // 选文件（可多选），只收绝对路径
      case 'dialog.selectFiles': {
        /** 对话框选中结果。 */
        const picked = await openGuestDialog(webContentsId, {
          properties: ['openFile', 'multiSelections']
        })
        /** 附件列表。 */
        const files = picked.flatMap((filePath) => {
          /** 待处理的值。 */
          const value = filePath.trim()
          // 相对路径直接丢掉
          if (!isAbsoluteGuestPath(value)) return []
          // 记住所在目录，后续同目录附件免再授权
          rememberPickedDirectory(webContentsId, value)
          return [{ path: value, name: path.basename(value) }]
        })
        return { files }
      }
      // 读文件预览：图片给缩略图，其它只回 MIME
      case 'dialog.readFilePreview': {
        /** 文件路径。 */
        const filePath = typeof record.path === 'string' ? record.path.trim() : ''
        // 必须是绝对路径
        if (!isAbsoluteGuestPath(filePath)) {
          return { code: 'VALIDATION_ERROR', message: 'path 必须是绝对路径' }
        }
        // 必须是用户通过选择器/拖拽授权过的路径
        if (!isGuestPathAllowed(webContentsId, filePath)) {
          return { code: 'FORBIDDEN', message: '附件路径未授权' }
        }
        // 文件不存在
        if (!fs.existsSync(filePath)) {
          return { code: 'NOT_FOUND', message: '文件不存在' }
        }
        /** 文件 stat。 */
        const stat = fs.statSync(filePath)
        // 目录或特殊文件不预览
        if (!stat?.isFile()) {
          return { code: 'VALIDATION_ERROR', message: '不是文件' }
        }
        /** 扩展名。 */
        const ext = path.extname(filePath).toLowerCase()
        /** 图片 MIME。 */
        const imageMime: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp'
        }
        /** MIME 类型。 */
        const mimeType = imageMime[ext] || ''
        // 非图片或超过 12MB：只回 MIME，不做缩略图
        if (!mimeType || stat.size > 12 * 1024 * 1024) {
          return { mimeType: mimeType || 'application/octet-stream' }
        }
        /** 图片元素。 */
        const image = nativeImage.createFromPath(filePath)
        // 解码失败，只回 MIME
        if (image.isEmpty()) return { mimeType }
        /** 大小。 */
        const size = image.getSize()
        /** 缩略图最长边。 */
        const maxEdge = 1280
        /** 是否需要缩小。 */
        const needsResize = Math.max(size.width, size.height) > maxEdge
        /** 预览数据。 */
        const preview = needsResize
          ? image.resize({
              width: size.width >= size.height ? maxEdge : undefined,
              height: size.height > size.width ? maxEdge : undefined,
              quality: 'best'
            })
          : image
        // 缩略图统一转 PNG data URL 回给页面
        return {
          mimeType,
          thumbnail: `data:image/png;base64,${preview.toPNG().toString('base64')}`
        }
      }
      // 记住页面拖进来的文件，等价于用户授权
      case 'dialog.rememberDroppedFiles': {
        /** 多行记录。 */
        const rows = Array.isArray(record.files) ? record.files : []
        /** 附件列表。 */
        const files = rows.flatMap((item) => {
          /** 待处理的值。 */
          const value = typeof item === 'string' ? item.trim() : ''
          // 只收绝对路径
          if (!isAbsoluteGuestPath(value)) return []
          try {
            // 必须是真实存在的文件
            if (!fs.statSync(value).isFile()) return []
          } catch {
            // stat 失败（不存在或无权限）
            return []
          }
          rememberPickedDirectory(webContentsId, value)
          return [value]
        })
        return { files }
      }
      // 授权项目目录：必须先经文件夹选择器选过
      case 'dialog.allowProjectDir': {
        /** 路径字符串。 */
        const pathValue = typeof record.path === 'string' ? record.path.trim() : ''
        // 必须是绝对路径
        if (!isAbsoluteGuestPath(pathValue)) {
          return { code: 'VALIDATION_ERROR', message: 'path 必须是绝对路径' }
        }
        /** 目录。 */
        const dir = pathValue
        // 没经选择器授权过，不允许凭空放行
        if (!hasPickedDirectory(webContentsId, dir)) {
          return {
            code: 'FORBIDDEN',
            message: '目录必须通过文件夹选择器选择'
          }
        }
        // 再记一次，续期该目录的授权
        rememberPickedDirectory(webContentsId, dir)
        return { ok: true }
      }
      // 写图片到系统剪贴板
      case 'clipboard.writeImage': {
        /** 原始入参。 */
        const raw = typeof record.pngBase64 === 'string' ? record.pngBase64.trim() : ''
        /** PNG 的 base64。 */
        const pngBase64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
        // 允许传 data URL，这里已剥掉前缀；空串直接拒
        if (!pngBase64) return { code: 'VALIDATION_ERROR', message: '需要 pngBase64' }
        /** 图片元素。 */
        const image = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'))
        // 解码不出图片
        if (image.isEmpty()) return { code: 'VALIDATION_ERROR', message: '图片无效' }
        clipboard.writeImage(image)
        return { ok: true }
      }
      // 截取应用页面指定区域
      case 'capture.pageArea': {
        /** Electron webContents。 */
        const contents = webContents.fromId(webContentsId)
        // 页面已销毁
        if (!contents || contents.isDestroyed()) {
          return { code: 'GENERATION_FAILED', message: '无法截图' }
        }
        /** 截图区域 x。 */
        const x = Math.round(Number(record.x))
        /** 截图区域 y。 */
        const y = Math.round(Number(record.y))
        /** 宽度。 */
        const width = Math.round(Number(record.width))
        /** 高度。 */
        const height = Math.round(Number(record.height))
        // 区域必须是有限数且宽高为正
        if (
          ![x, y, width, height].every((value) => Number.isFinite(value)) ||
          width < 1 ||
          height < 1
        ) {
          return { code: 'VALIDATION_ERROR', message: '截图区域无效' }
        }
        /** 图片元素。 */
        const image = await contents.capturePage({ x, y, width, height })
        // 区域超出可视范围等情况会得到空图
        if (image.isEmpty()) return { code: 'GENERATION_FAILED', message: '截图为空' }
        return { pngBase64: image.toPNG().toString('base64') }
      }
      // 斜杠命令目录：技能 + MCP 工具
      case 'catalog.slash': {
        // 需要登录
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        /** 可捕获的桌面源。 */
        const sources = deps.listSlashSources
          ? await deps.listSlashSources()
          : { skills: [], tools: [] }
        // 合并应用自带技能与平台技能 / 工具
        return buildJiaorongSlashCatalog({
          appId: runtime.id,
          appDir: runtime.appDir ?? null,
          skills: sources.skills,
          tools: sources.tools
        })
      }
      // 可用模型列表
      case 'catalog.models': {
        // 需要登录
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        // 依赖没接上就给空表
        return { models: deps.listEnabledModels ? deps.listEnabledModels() : [] }
      }
      // 系统提示词列表
      case 'catalog.systemPrompts': {
        // 需要登录
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        return { prompts: deps.listSystemPrompts ? await deps.listSystemPrompts() : [] }
      }
      // 智能体可配置工具
      case 'catalog.agentTools': {
        // 需要登录
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        /** 会话 id。 */
        const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
        // 带 sessionId 时要先校验会话归属
        if (sessionId) {
          // 对话端口没接上
          if (!deps.dialogue) {
            return { code: 'FORBIDDEN', message: '当前不能列出工具' }
          }
          /** 会话记录。 */
          const session = await deps.dialogue.getSession(sessionId)
          // 会话不存在
          if (!session) {
            return { code: 'SESSION_NOT_FOUND', message: '未找到会话' }
          }
          // 会话不属于本应用的智能体
          if (!appAgentIds(runtime.id).has(session.agentId)) {
            return { code: 'FORBIDDEN', message: '会话不属于本应用' }
          }
        }
        // 无 sessionId 时列全局可配置工具
        return {
          tools: deps.listConfigurableAgentTools
            ? await deps.listConfigurableAgentTools({
                sessionId: sessionId || undefined
              })
            : []
        }
      }
      // 知识库列表查询
      case 'knowledgeBase.query':
        return queryJiaorongKnowledgeBases(deps, record)
      // 知识库目录下探
      case 'knowledgeBase.queryDirectory':
        return queryJiaorongKnowledgeBaseDirectory(deps, record)
      // 其余方法交给对话桥（agent / session 等）
      default: {
        /** 调用结果。 */
        const result = await handleDialogueInvoke(deps, runtime, method, args, webContentsId)
        // 对话桥认得这个方法
        if (result !== undefined) return result
        // 两边都不认，拒绝未知方法
        return { code: 'FORBIDDEN', message: `未知的应用桥方法：${method}` }
      }
    }
  } catch (error) {
    // 已经是标准失败体，原样返回
    if (isJiaorongBridgeFailure(error)) return error
    /** 桥失败对象。 */
    const failure = toJiaorongBridgeInvokeFailure(error)
    // 只记说明，避免把敏感入参写进日志
    console.warn('[jiaorong-app] bridge invoke failed', method, failure.message)
    return failure
  }
}
