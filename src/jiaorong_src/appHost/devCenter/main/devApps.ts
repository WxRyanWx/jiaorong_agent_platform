/** 开发者本地登记名单：渲染浏览器存储为唯一源，主进程只持内存镜像供扫盘合并。 */

import fs from 'node:fs'
import {
  inspectManifestRecord,
  manifestIssueMessage,
  readManifestString
} from '../../manifestRules'
import { readAppManifest } from '../../main/manifest'
import type { JiaorongAppCatalogRecord, JiaorongDevAppRecord } from '../../types'

/** 主进程内存镜像；渲染 sync 过来才有人。 */
let devApps: JiaorongDevAppRecord[] = []

const readString = readManifestString

/**
 * 校验并替换内存名单；非法条目直接丢弃。
 * @param input 渲染同步来的原始数组
 */
export function syncDevApps(input: unknown): JiaorongDevAppRecord[] {
  if (!Array.isArray(input)) {
    devApps = []
    return devApps
  }
  /** 去重后的合法条目。 */
  const next: JiaorongDevAppRecord[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    /** 单条原始数据。 */
    const record = raw as Record<string, unknown>
    /** 应用 id。 */
    const id = readString(record.id)
    /** 插件文件夹。 */
    const dir = readString(record.dir)
    // id / dir 缺一即非法；同 id 只留第一条
    if (!id || !dir || next.some((item) => item.id === id)) continue
    /** 清单图标：旧名单没存 icon 时回目录补读。 */
    const icon = readString(record.icon) || readAppManifest(dir)?.icon || ''
    next.push({
      id,
      name: readString(record.name) || id,
      version: readString(record.version) || '0.0.0',
      ...(readString(record.description) ? { description: readString(record.description) } : {}),
      ...(icon ? { icon } : {}),
      dir,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now()
    })
  }
  devApps = next
  return devApps
}

/** 当前内存名单快照。 */
export function getDevApps(): readonly JiaorongDevAppRecord[] {
  return devApps
}

/**
 * 是否为开发者中心登记的本地包（工作区 link，不进应用中心 / 侧栏）。
 * @param appId 应用 id
 */
export function isDevCenterAppId(appId: string): boolean {
  return devApps.some((item) => item.id === appId)
}

/**
 * 名单转本地调试目录记录，供 scan 并入运行时。
 * @param skipIds 已收录的 id，避免覆盖 OSS / 用户目录包
 */
export function devAppCatalogRecords(
  skipIds: ReadonlySet<string>
): { record: JiaorongAppCatalogRecord; dir: string }[] {
  return devApps
    .filter((item) => !skipIds.has(item.id))
    .map((item) => ({
      record: {
        id: item.id,
        name: item.name,
        version: item.version,
        ...(item.description ? { description: item.description } : {}),
        ...(item.icon ? { icon: item.icon } : {}),
        slot: 'app-center' as const,
        source: 'local-debug' as const,
        enabled: true,
        auth: null,
        provider: '本地开发',
        package: { kind: 'dir' as const, builtinDir: item.id }
      },
      dir: item.dir
    }))
}

/**
 * 读目录 app.json 原文并解析成字段表；不可读 / 非法 JSON / 非对象都返回 null。
 * @param appDir 插件文件夹
 */
function readRawManifest(appDir: string): Record<string, unknown> | null {
  /** 清单文件路径。 */
  const manifestPath = `${appDir.replace(/[/\\]+$/, '')}/app.json`
  /** 原文。 */
  let rawText = ''
  try {
    // 读不到文件视为没有清单
    rawText = fs.readFileSync(manifestPath, 'utf8')
  } catch {
    return null
  }
  /** 解析结果。 */
  let parsed: unknown = null
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

/**
 * 校验插件文件夹能否被登记并 spawn；返回中文原因，null 表示通过。
 * @param appDir 插件文件夹
 */
export function inspectDevAppDir(appDir: string): string | null {
  /** 清单字段表。 */
  const record = readRawManifest(appDir)
  // 清单读不出来就没法登记
  if (!record) return '所选目录没有 app.json，或 app.json 不是合法 JSON'
  /** 字段校验结果。 */
  const issue = inspectManifestRecord(record)
  return issue ? manifestIssueMessage(issue) : null
}
