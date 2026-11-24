/**
 * 客户端安装包直链：OSS 上的固定文件名，按平台与架构选一个。
 *
 * 主进程（更新失败态、官网下载按钮）与渲染进程（设置-关于）都用这一份映射，
 * 避免两边各自维护平台判断而指向不同产物。
 */

export const JIAORONG_DOWNLOAD_BASE_URL = 'https://c4ai.ccccltd.cn/xkprosdk'

export type AppDownloadPlatform = 'windows' | 'mac' | 'linux'
export type AppDownloadArch = 'x64' | 'arm64'

export type AppDownloadArtifact = {
  platform: AppDownloadPlatform
  arch: AppDownloadArch
  fileName: string
  url: string
}

/** 每个平台发布的产物；Linux 同时发布 x64 / arm64（需确认 OSS 上对应文件存在）。 */
const ARTIFACT_FILE_NAMES: Record<AppDownloadPlatform, Record<AppDownloadArch, string>> = {
  windows: {
    x64: 'JiaorongAI-windows-x64.exe',
    arm64: 'JiaorongAI-windows-arm64.exe'
  },
  mac: {
    x64: 'JiaorongAI-mac-x64.dmg',
    arm64: 'JiaorongAI-mac-arm64.dmg'
  },
  linux: {
    x64: 'JiaorongAI-linux-x64.tar.gz',
    arm64: 'JiaorongAI-linux-arm64.tar.gz'
  }
}

const toPlatform = (platform: string): AppDownloadPlatform | null => {
  const normalized = platform.trim().toLowerCase()
  if (normalized === 'win32' || normalized === 'windows') return 'windows'
  if (normalized === 'darwin' || normalized === 'mac' || normalized === 'macos') return 'mac'
  if (normalized === 'linux') return 'linux'
  // 未知平台不猜：宁可先不显示链接，也不要给错平台的安装包
  return null
}

const toArch = (arch: string): AppDownloadArch => {
  return arch.trim().toLowerCase() === 'arm64' ? 'arm64' : 'x64'
}

export function resolveAppDownloadArtifact(input: {
  platform: string
  arch: string
}): AppDownloadArtifact | null {
  const platform = toPlatform(input.platform)
  if (!platform) {
    return null
  }
  const arch = toArch(input.arch)
  const fileName = ARTIFACT_FILE_NAMES[platform][arch]

  return {
    platform,
    arch,
    fileName,
    url: `${JIAORONG_DOWNLOAD_BASE_URL}/${fileName}`
  }
}
