/** 应用安装路径、内置包路径、preload 路径，以及拷贝内置应用时的过滤。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { getAppHomeDir } from '@jiaorong/brand/appIdentity'

/**
 * 用户机上已安装应用的根目录：`~/.jiaorongchat/apps`。
 * @param homeDir 用户 home，测试可注入
 */
export function getUserAppsRoot(homeDir = os.homedir()): string {
  return path.join(getAppHomeDir(homeDir), 'apps')
}

/**
 * 单个应用的安装目录。
 * @param appId 应用 id
 * @param homeDir 用户 home
 */
export function getUserAppDir(appId: string, homeDir = os.homedir()): string {
  return path.join(getUserAppsRoot(homeDir), appId)
}

/**
 * 开发态内置应用根：electron-vite 的 `app.getAppPath()` 可能是 `out/main`，
 * 不能只拼这一条。
 * @param candidates 候选绝对路径，命中第一个存在的目录
 */
export function resolveUnpackagedBuiltinAppsRoot(candidates: string[]): string {
  for (const dir of candidates) {
    // 命中第一个真实存在的目录就用它
    if (dir && fs.existsSync(dir)) return dir
  }
  // 一个都不存在：退回第一个候选，让上层报「应用未找到」而不是崩在这里
  return candidates[0] ?? ''
}

/** 内置应用源根：开发走仓库 `apps/`，安装包走 `resources/jiaorong-apps`。 */
export function getBuiltinAppsRoot(): string {
  // 打包后固定放在 extraResources 里
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'jiaorong-apps')
  }
  // 开发态 `app.getAppPath()` 可能指向 out/main，逐个候选试
  return resolveUnpackagedBuiltinAppsRoot([
    path.join(app.getAppPath(), 'src', 'jiaorong_src', 'apps'),
    path.join(__dirname, '../../src/jiaorong_src/apps'),
    path.join(process.cwd(), 'src/jiaorong_src/apps')
  ])
}

/**
 * 某个内置应用的源目录。
 * @param builtinDir 目录 JSON 里的 `package.builtinDir`
 */
export function getBuiltinAppDir(builtinDir: string): string {
  return path.join(getBuiltinAppsRoot(), builtinDir)
}

/** 打包后的应用 preload 绝对路径（`jiaorongApp.mjs`）。 */
export function getAppPreloadPath(): string {
  return path.join(__dirname, '../preload/jiaorongApp.mjs')
}

/** `<webview preload>` 只接受 file: URL，不能传裸文件系统路径。 */
export function getAppPreloadFileUrl(): string {
  return pathToFileURL(getAppPreloadPath()).href
}

/**
 * `targetPath` 是否落在 `rootPath` 内（拒绝 `..` 逃逸）。
 * @param rootPath 允许的根
 * @param targetPath 待检查路径
 */
export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  /** 相对根的路径；逃逸会以 `..` 开头。 */
  const relativePath = path.relative(rootPath, targetPath)
  // 空串表示就是根本身；否则要求不以 `..` 开头且不是绝对路径（跨盘）
  return (
    relativePath === '' ||
    (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  )
}

/**
 * 确保目录存在。
 * @param dirPath 目录
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

/**
 * 拷贝内置应用到用户目录时是否包含该文件。排除 `web/` 源码、`node_modules`、`.git`。
 * @param sourceRoot 内置应用根
 * @param filePath 待拷贝文件
 */
export function shouldCopyAppPath(sourceRoot: string, filePath: string): boolean {
  /** 相对应用根的路径。 */
  const relative = path.relative(sourceRoot, filePath)
  // 根自身不拷；相对路径以 `..` 开头说明在源目录之外
  if (!relative || relative.startsWith('..')) return false
  /** 路径分段，用于判断 `web` / `node_modules`。 */
  const parts = relative.split(path.sep)
  // 依赖与 git 目录不进用户安装目录
  if (parts.includes('node_modules') || parts.includes('.git')) return false
  // `web/` 是前端源码，运行只需要构建产物
  if (parts[0] === 'web') return false
  return true
}
