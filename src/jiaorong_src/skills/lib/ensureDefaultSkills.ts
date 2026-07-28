import { createDeviceClient } from '@api/DeviceClient'
import { useSkillsStore } from '@/stores/skillsStore'
import { listRemoteSkills } from '../../api/skills'
import { installSkillFromZipUrl } from '../../utils/downloadSkill/installSkillFromZipUrl'
import { refreshSkillsCatalog } from '../../utils/refreshSkillsCatalog'
import {
  loadRemoteInstallMap,
  rememberRemoteInstall,
  rememberSkillSource,
  SkillSource
} from './sessionSkill'
import { DEFAULT_MARKET_SKILLS } from './defaultSkillsManifest'
import { emitDefaultSkillInstallPhase } from './defaultSkillInstallEvents'

export const JIAORONG_DEFAULT_SKILLS_SEED_VERSION_KEY = 'jiaorongDefaultSkillsSeedVersion'

export type EnsureDefaultSkillsResult = {
  skipped: boolean
  reason?: string
  installed: string[]
  alreadyInstalled: string[]
  failed: Array<{ marketName: string; error: string }>
  missingInCatalog: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b)
}

/**
 * 解析默认技能对应的本地目录名（市场 name 或 remoteInstallMap）。
 * 找不到则返回 null。
 */
export function resolveLocalNameForDefault(
  marketName: string,
  localNames: readonly string[],
  remoteInstallMap: Record<string, string>
): string | null {
  const direct = localNames.find((local) => namesMatch(local, marketName))
  if (direct) return direct

  for (const [market, local] of Object.entries(remoteInstallMap)) {
    if (!namesMatch(market, marketName)) continue
    const hit = localNames.find((name) => namesMatch(name, local))
    if (hit) return hit
  }
  return null
}

export function isDefaultSkillPresentLocally(
  marketName: string,
  localNames: readonly string[],
  remoteInstallMap: Record<string, string>
): boolean {
  return resolveLocalNameForDefault(marketName, localNames, remoteInstallMap) != null
}

export type RemoteSkillSeedItem = {
  id: string
  name: string
  downloadUrl: string
}

/** 远程 list 的 name 与清单 marketName 匹配 */
export function findRemoteSkillForDefault(
  marketName: string,
  remote: readonly RemoteSkillSeedItem[]
): RemoteSkillSeedItem | null {
  return remote.find((item) => namesMatch(item.name, marketName)) ?? null
}

function readSeedVersion(): string {
  try {
    return localStorage.getItem(JIAORONG_DEFAULT_SKILLS_SEED_VERSION_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

function writeSeedVersion(version: string): void {
  try {
    localStorage.setItem(JIAORONG_DEFAULT_SKILLS_SEED_VERSION_KEY, version)
  } catch {
    // ignore quota
  }
}

async function waitForAuthToken(timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      if (localStorage.getItem('xkaitoken')?.trim()) return true
    } catch {
      // ignore
    }
    await sleep(1000)
  }
  try {
    return Boolean(localStorage.getItem('xkaitoken')?.trim())
  } catch {
    return false
  }
}

function mapRemoteRaw(raw: Record<string, unknown>[]): RemoteSkillSeedItem[] {
  return raw
    .map((item) => {
      const name = String(item.name ?? '').trim()
      const downloadUrl = String(item.downloadUrl ?? '').trim()
      const id = String(item.id ?? '').trim()
      return { id, name, downloadUrl }
    })
    .filter((item) => Boolean(item.name))
}

let inFlight: Promise<EnsureDefaultSkillsResult> | null = null

/**
 * 应用安装/升级后补装默认市场技能（按 appVersion 只跑一轮）。
 * 未登录会等待 token；超时则跳过本轮且不写版本（下次启动可再试）。
 */
export async function ensureDefaultSkills(options?: {
  force?: boolean
  authWaitMs?: number
}): Promise<EnsureDefaultSkillsResult> {
  if (inFlight) return inFlight
  inFlight = runEnsureDefaultSkills(options).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runEnsureDefaultSkills(options?: {
  force?: boolean
  authWaitMs?: number
}): Promise<EnsureDefaultSkillsResult> {
  const empty: EnsureDefaultSkillsResult = {
    skipped: true,
    installed: [],
    alreadyInstalled: [],
    failed: [],
    missingInCatalog: []
  }

  let appVersion = ''
  try {
    appVersion = await createDeviceClient().getAppVersion()
  } catch (error) {
    return { ...empty, reason: `getAppVersion failed: ${String(error)}` }
  }
  if (!appVersion) {
    return { ...empty, reason: 'empty app version' }
  }

  if (!options?.force && readSeedVersion() === appVersion) {
    return { ...empty, reason: 'already seeded for this version' }
  }

  const hasToken = await waitForAuthToken(options?.authWaitMs ?? 120_000)
  if (!hasToken) {
    return { ...empty, reason: 'auth token timeout' }
  }

  if (!options?.force && readSeedVersion() === appVersion) {
    return { ...empty, reason: 'already seeded for this version' }
  }

  const result: EnsureDefaultSkillsResult = {
    skipped: false,
    installed: [],
    alreadyInstalled: [],
    failed: [],
    missingInCatalog: []
  }

  let remote: RemoteSkillSeedItem[] = []
  try {
    const raw = await listRemoteSkills()
    remote = mapRemoteRaw(raw)
  } catch (error) {
    return {
      ...empty,
      skipped: true,
      reason: `listRemoteSkills failed: ${String(error)}`
    }
  }
  // 空目录多为接口异常/未就绪，不写版本闸门，避免本版本永久跳过补装
  if (remote.length === 0) {
    return { ...empty, reason: 'empty remote catalog' }
  }

  const skillsStore = useSkillsStore()
  try {
    await skillsStore.loadSkills()
  } catch {
    // continue
  }
  const localNames = skillsStore.skills.map((s) => s.name)
  const remoteInstallMap = loadRemoteInstallMap()

  for (const marketName of DEFAULT_MARKET_SKILLS) {
    if (resolveLocalNameForDefault(marketName, localNames, remoteInstallMap)) {
      result.alreadyInstalled.push(marketName)
      continue
    }

    const remoteItem = findRemoteSkillForDefault(marketName, remote)
    if (!remoteItem?.downloadUrl) {
      result.missingInCatalog.push(marketName)
      continue
    }

    emitDefaultSkillInstallPhase(marketName, 'start')
    try {
      const installResult = await installSkillFromZipUrl(remoteItem.downloadUrl, {
        silent: true
      })
      if (!installResult.success) {
        result.failed.push({
          marketName,
          error: installResult.error || 'install failed'
        })
        continue
      }
      const localSkillName = installResult.skillName?.trim() || marketName
      rememberRemoteInstall(marketName, localSkillName)
      if (installResult.skillName) {
        rememberSkillSource(installResult.skillName, SkillSource.RemoteApi)
      }
      result.installed.push(marketName)
      localNames.push(localSkillName)
    } catch (error) {
      result.failed.push({
        marketName,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      emitDefaultSkillInstallPhase(marketName, 'end')
    }
  }

  // 有新装时刷新本地目录，供 / 菜单等消费
  if (result.installed.length > 0) {
    try {
      await refreshSkillsCatalog()
    } catch (error) {
      console.error('[jiaorong] refreshSkillsCatalog after seed failed:', error)
    }
  }

  // 仍有失败项时不写版本闸门，下次启动可重试补装；
  // missingInCatalog 视为本轮无法装（目录无此技能），不阻塞闸门
  if (result.failed.length === 0) {
    writeSeedVersion(appVersion)
  }

  if (import.meta.env.DEV) {
    console.info('[jiaorong] default skills seed', result)
  }
  return result
}

/** 空闲调度；幂等 */
export function scheduleEnsureDefaultSkills(): void {
  const run = () => {
    void ensureDefaultSkills().catch((error) => {
      console.error('[jiaorong] ensureDefaultSkills failed:', error)
    })
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout: 5000 })
  } else {
    setTimeout(run, 0)
  }
}
