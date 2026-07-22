import { useSkillsStore } from '@/stores/skillsStore'
import { useLegacyPresenter } from '@api/legacy/presenters'
import type { SkillInstallResult } from '@shared/types/skill'
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

/** 下载 zip 一次，写入临时文件，供后续 installFromZip 复用 */
async function downloadZipToTemp(url: string): Promise<string> {
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

    const filePresenter = useLegacyPresenter('filePresenter', { safeCall: false })
    const zipPath = await filePresenter.writeTemp({
      name: `skill-url-${Date.now()}.zip`,
      // IPC 会把 Uint8Array 弄丢，传 number[]
      content: Array.from(buffer)
    })
    if (!zipPath) {
      throw new Error('Failed to write temp zip')
    }
    return zipPath
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
 * 只下载一次：安装失败若为同名冲突，确认覆盖后复用同一临时 zip。
 */
export async function installSkillFromZipUrl(url: string): Promise<InstallSkillFromZipUrlResult> {
  const validationError = validateZipSkillUrl(url)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const trimmed = url.trim()
  const skillsStore = useSkillsStore()

  try {
    const zipPath = await downloadZipToTemp(trimmed)
    const first = await skillsStore.installFromZip(zipPath, { overwrite: false })

    if (first.success) {
      if (first.skillName) {
        rememberSkillSource(first.skillName, SkillSource.Zip)
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
    const shouldOverwrite = await confirmSkillOverwrite(conflictName)
    if (!shouldOverwrite) {
      return {
        success: false,
        error: '用户取消覆盖',
        skillName: conflictName || undefined
      }
    }

    const second = await skillsStore.installFromZip(zipPath, { overwrite: true })
    if (!second.success) {
      return {
        success: false,
        error: second.error || 'install failed',
        skillName: second.skillName || second.existingSkillName || conflictName
      }
    }

    if (second.skillName) {
      rememberSkillSource(second.skillName, SkillSource.Zip)
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
