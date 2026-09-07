import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { isAppVisibleToUser } from '../auth'
import { loadBuiltinAppCatalog, mergeAppCatalogs } from '../catalog'
import type {
  JiaorongAppCatalogRecord,
  JiaorongAppInstallStatus,
  JiaorongAppRuntime,
  JiaorongAppUserIdentity
} from '../types'
import { readAppManifest } from './manifest'
import {
  ensureDir,
  getBuiltinAppDir,
  getUserAppDir,
  getUserAppsRoot,
  shouldCopyAppPath
} from './paths'

function compareAppVersion(installed: string | null | undefined, catalog: string): boolean {
  return Boolean(installed && installed !== catalog)
}

function stashPath(destDir: string): string {
  return path.join(os.tmpdir(), `jiaorong-app-nm-${path.basename(destDir)}-${Date.now()}`)
}

function warnMissingNodeDependencies(appDir: string): void {
  const nodeDir = path.join(appDir, 'node')
  if (!fs.existsSync(path.join(nodeDir, 'package.json'))) return
  if (fs.existsSync(path.join(nodeDir, 'node_modules'))) return
  console.warn(
    '[jiaorong-app] node_modules missing in',
    nodeDir,
    '(bundle them with the app; do not install on the user machine)'
  )
}

function copyBuiltinApp(sourceDir: string, destDir: string): void {
  ensureDir(path.dirname(destDir))
  const destNodeModules = path.join(destDir, 'node', 'node_modules')
  const sourceNodeModules = path.join(sourceDir, 'node', 'node_modules')
  const stash = stashPath(destDir)
  let stashed = false
  if (fs.existsSync(destNodeModules)) {
    try {
      fs.cpSync(destNodeModules, stash, { recursive: true })
      stashed = true
    } catch (error) {
      console.warn('[jiaorong-app] Failed to stash node_modules', destDir, error)
    }
  }
  try {
    fs.rmSync(destDir, { recursive: true, force: true })
  } catch (error) {
    console.warn('[jiaorong-app] Failed to clear app dir before copy', destDir, error)
  }
  fs.cpSync(sourceDir, destDir, {
    recursive: true,
    filter: (filePath) => {
      if (filePath === sourceDir) return true
      return shouldCopyAppPath(sourceDir, filePath)
    }
  })
  const copiedNodeModules = path.join(destDir, 'node', 'node_modules')
  if (fs.existsSync(sourceNodeModules)) {
    try {
      fs.cpSync(sourceNodeModules, copiedNodeModules, {
        recursive: true,
        dereference: true
      })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to copy source node_modules', destDir, error)
    }
  } else if (stashed && fs.existsSync(path.join(destDir, 'node'))) {
    try {
      fs.cpSync(stash, copiedNodeModules, { recursive: true, dereference: true })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to restore node_modules', destDir, error)
    }
  }
  if (stashed) {
    try {
      fs.rmSync(stash, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
  warnMissingNodeDependencies(destDir)
}

function listLocalDebugApps(catalogIds: Set<string>): JiaorongAppCatalogRecord[] {
  const root = getUserAppsRoot()
  if (!fs.existsSync(root)) return []
  const extras: JiaorongAppCatalogRecord[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (catalogIds.has(entry.name)) continue
    const appDir = path.join(root, entry.name)
    const manifest = readAppManifest(appDir)
    if (!manifest || manifest.id !== entry.name) continue
    extras.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      slot: 'menu',
      source: 'local-debug',
      enabled: true,
      auth: null,
      package: { kind: 'dir', builtinDir: manifest.id }
    })
  }
  return extras
}

function resolveRuntime(
  record: JiaorongAppCatalogRecord,
  user: JiaorongAppUserIdentity
): JiaorongAppRuntime {
  const visible = record.enabled !== false && isAppVisibleToUser(record.auth, user)
  const userDir = getUserAppDir(record.id)
  const userManifest = fs.existsSync(userDir) ? readAppManifest(userDir) : null

  let appDir: string | null = null
  let installedVersion: string | null = null
  let installStatus: JiaorongAppInstallStatus = 'not_installed'

  if (userManifest) {
    appDir = userDir
    installedVersion = userManifest.version
    installStatus = compareAppVersion(installedVersion, record.version)
      ? 'update_available'
      : 'installed'
  } else if (record.source === 'local-debug') {
    installStatus = 'error'
  }

  const manifest = appDir ? readAppManifest(appDir) : null
  return {
    ...record,
    visible,
    installStatus,
    installedVersion,
    appDir,
    entry: manifest?.entry ?? null,
    node: manifest?.node ?? null
  }
}

export function scanJiaorongApps(user: JiaorongAppUserIdentity): JiaorongAppRuntime[] {
  const builtin = loadBuiltinAppCatalog()
  const merged = mergeAppCatalogs(builtin, [])
  const catalogIds = new Set(merged.map((item) => item.id))
  const localDebug = listLocalDebugApps(catalogIds)
  return [...merged, ...localDebug].map((record) => resolveRuntime(record, user))
}

export function ensureJiaorongAppInstalled(
  runtime: JiaorongAppRuntime,
  options?: { refresh?: boolean }
): JiaorongAppRuntime {
  if (runtime.source === 'local-debug') return runtime

  const destDir = getUserAppDir(runtime.id)
  const destManifest = fs.existsSync(destDir) ? readAppManifest(destDir) : null
  const refreshUnpackaged = options?.refresh === true && !app.isPackaged
  if (destManifest && destManifest.version === runtime.version && !refreshUnpackaged) {
    return {
      ...runtime,
      appDir: destDir,
      installedVersion: destManifest.version,
      installStatus: 'installed',
      entry: destManifest.entry,
      node: destManifest.node ?? null
    }
  }

  const builtinDir = runtime.package.builtinDir
    ? getBuiltinAppDir(runtime.package.builtinDir)
    : null
  if (!builtinDir || !fs.existsSync(builtinDir)) {
    if (destManifest) {
      return {
        ...runtime,
        appDir: destDir,
        installedVersion: destManifest.version,
        installStatus: 'installed',
        entry: destManifest.entry,
        node: destManifest.node ?? null
      }
    }
    return { ...runtime, installStatus: 'error' }
  }

  try {
    copyBuiltinApp(builtinDir, destDir)
  } catch (error) {
    console.error('[jiaorong-app] Failed to copy builtin app', runtime.id, error)
    return { ...runtime, installStatus: 'error' }
  }
  const manifest = readAppManifest(destDir)
  return {
    ...runtime,
    appDir: destDir,
    installedVersion: manifest?.version ?? runtime.version,
    installStatus: 'installed',
    entry: manifest?.entry ?? runtime.entry,
    node: manifest?.node ?? runtime.node
  }
}

export function findVisibleOpenableApp(
  apps: JiaorongAppRuntime[],
  appId: string
): JiaorongAppRuntime | null {
  const runtime = apps.find((item) => item.id === appId)
  if (!runtime?.visible) return null
  if (runtime.source === 'store' && runtime.installStatus === 'not_installed') return null
  return runtime
}
