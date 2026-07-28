import { useSkillsStore } from '@/stores/skillsStore'
import { useLegacyPresenter } from '@api/legacy/presenters'
import type { SkillInstallResult } from '@shared/types/skill'
import {
  fallbackNameFromRemoteZipUrl,
  installSkillFromZipBytesCompat
} from '../../skills/lib/installLocalSkill'
import { rememberSkillSource, SkillSource } from '../../skills/lib/sessionSkill'
import { confirmSkillOverwrite } from './confirmSkillOverwrite'

export type InstallSkillFromZipUrlResult = {
  success: boolean
  /** 安装成功时的技能名 */
  skillName?: string
  /** 失败时的报错信息 */
  error?: string
}

function validateZipSkillUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) {
    return 'url is required'
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'invalid url'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'url must be http or https'
  }

  return null
}

function isConflictResult(result: SkillInstallResult): boolean {
  return result.errorCode === 'conflict' || Boolean(result.error?.includes('already exists'))
}

function resolveConflictSkillName(result: SkillInstallResult): string {
  if (result.existingSkillName?.trim()) {
    return result.existingSkillName.trim()
  }
  if (result.skillName?.trim()) {
    return result.skillName.trim()
  }
  const matched = result.error?.match(/"([^"]+)"/)?.[1]
  return matched?.trim() || ''
}

const ZIP_MAX_SIZE = 200 * 1024 * 1024 // 与宿主 SkillPresenter 一致
const DOWNLOAD_TIMEOUT_MS = 30 * 1000

/** 下载远程 zip 字节（不落盘为 skill-url 临时名，避免丢失真实包名） */
async function downloadZipBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Failed to download skill zip: ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.parseInt(contentLength, 10) > ZIP_MAX_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes (max: ${ZIP_MAX_SIZE})`)
    }

    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength === 0) {
      throw new Error('Downloaded zip is empty')
    }
    if (buffer.byteLength > ZIP_MAX_SIZE) {
      throw new Error(
        `Downloaded file too large: ${buffer.byteLength} bytes (max: ${ZIP_MAX_SIZE})`
      )
    }
    return buffer
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Download timed out')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 从 zip 技能包下载地址安装技能。
 * 经 installLocalSkill 规范化 SKILL.md（兼容 **name:** / 中文名等），再交给开源安装。
 * 只下载一次：安装失败若为同名冲突，确认覆盖后复用同一份字节。
 */
export async function installSkillFromZipUrl(
  url: string,
  options?: { silent?: boolean }
): Promise<InstallSkillFromZipUrlResult> {
  const validationError = validateZipSkillUrl(url)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const silent = Boolean(options?.silent)
  const trimmed = url.trim()
  const skillsStore = useSkillsStore()
  const filePresenter = useLegacyPresenter('filePresenter', { safeCall: false })
  const fallbackName = fallbackNameFromRemoteZipUrl(trimmed)

  /** legacy IPC 会弄坏 Uint8Array，改传 number[] */
  const toWriteTempContent = (
    content: string | Buffer | ArrayBuffer | Uint8Array
  ): string | Buffer | ArrayBuffer | number[] => {
    if (typeof content === 'string') return content
    if (content instanceof Uint8Array) return Array.from(content)
    if (content instanceof ArrayBuffer) return Array.from(new Uint8Array(content))
    return content
  }

  const deps = {
    writeTemp: async (file: {
      name: string
      content: string | Buffer | ArrayBuffer | Uint8Array
    }) => {
      const tempPath = await filePresenter.writeTemp({
        name: file.name,
        content: toWriteTempContent(file.content)
      })
      if (typeof tempPath !== 'string' || !tempPath) {
        throw new Error('写入临时文件失败，请重试')
      }
      return tempPath
    },
    installFromFolder: (folderPath: string, options?: { overwrite?: boolean }) =>
      skillsStore.installFromFolder(folderPath, options),
    installFromZip: (zipPath: string, options?: { overwrite?: boolean }) =>
      skillsStore.installFromZip(zipPath, options)
  }

  try {
    const zipBytes = await downloadZipBytes(trimmed)

    const first = await installSkillFromZipBytesCompat({
      zipBytes,
      fallbackName,
      overwrite: false,
      ...deps
    })

    if (first.success) {
      if (first.skillName) {
        rememberSkillSource(first.skillName, SkillSource.RemoteApi)
      }
      return { success: true, skillName: first.skillName }
    }

    if (!isConflictResult(first)) {
      return {
        success: false,
        error: first.error || 'install failed',
        skillName: first.skillName || first.existingSkillName
      }
    }

    const conflictName = resolveConflictSkillName(first)
    // 静默模式：同名已存在视为已装，不弹覆盖确认
    if (silent) {
      return { success: true, skillName: conflictName || undefined }
    }

    const shouldOverwrite = await confirmSkillOverwrite(conflictName)
    if (!shouldOverwrite) {
      return {
        success: false,
        error: '用户取消覆盖',
        skillName: conflictName || undefined
      }
    }

    const second = await installSkillFromZipBytesCompat({
      zipBytes,
      fallbackName,
      overwrite: true,
      ...deps
    })
    if (!second.success) {
      return {
        success: false,
        error: second.error || 'install failed',
        skillName: second.skillName || second.existingSkillName || conflictName
      }
    }

    if (second.skillName) {
      rememberSkillSource(second.skillName, SkillSource.RemoteApi)
    }

    return {
      success: true,
      skillName: second.skillName
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
