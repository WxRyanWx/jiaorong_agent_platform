export type SkillInstallErrorContext =
  | 'folder'
  | 'zip'
  | 'md'
  | 'remote'
  | 'uninstall'
  | 'pick'
  | 'unknown'

/** 去掉 Electron IPC / Error 前缀，便于匹配宿主英文错误 */
export function unwrapSkillInstallErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return raw
    .trim()
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/gi, '')
    .trim()
}

function fallbackByContext(context: SkillInstallErrorContext): string {
  if (context === 'uninstall') {
    return '卸载失败，请稍后重试'
  }
  if (context === 'pick') {
    return '选择文件失败，请重试'
  }
  return '安装失败，请确认内容为有效技能（含 SKILL.md）后重试'
}

function systemFallbackByContext(context: SkillInstallErrorContext): string {
  if (context === 'uninstall') {
    return '卸载失败，请检查文件权限后重试'
  }
  if (context === 'pick') {
    return '无法选择文件，请检查权限后重试'
  }
  return '安装失败，请检查技能包格式或文件权限后重试'
}

/**
 * 将技能安装/卸载失败的技术英文/系统错误转为用户可读中文。
 * 文件夹安装内部可能转 zip，故 folder 上下文避免强调「压缩包」。
 */
export function formatSkillInstallError(
  error: unknown,
  context: SkillInstallErrorContext = 'unknown'
): string {
  const text = unwrapSkillInstallErrorMessage(error)
  if (!text) {
    if (context === 'uninstall') return '卸载失败，请稍后重试'
    if (context === 'pick') return '选择文件失败，请重试'
    return '安装失败，请稍后重试'
  }

  const lower = text.toLowerCase()

  if (lower.includes('protected-system-skill')) {
    return '系统内置或默认技能不可删除'
  }

  if (lower.includes('skill.md not found')) {
    if (context === 'folder') {
      return '未找到 SKILL.md。请选择包含 SKILL.md 的技能文件夹'
    }
    if (context === 'zip' || context === 'remote') {
      return '压缩包内未找到 SKILL.md。请上传符合规范的技能包（内含技能目录与 SKILL.md），不要上传普通附件'
    }
    if (context === 'md') {
      return '未找到有效的技能说明文件，请上传包含 frontmatter 的 SKILL.md'
    }
    return '未找到 SKILL.md，请确认上传内容为有效技能'
  }

  if (lower.includes('enotempty') || lower.includes('directory not empty')) {
    if (context === 'uninstall') {
      return '卸载失败：目录被占用或未清空，请关闭相关程序后重试'
    }
    return '不是有效的技能压缩包（缺少 SKILL.md 或包结构不正确），请更换后重试'
  }

  if (
    lower.includes('invalid zip') ||
    lower.includes('end of central directory') ||
    lower.includes('corrupted zip')
  ) {
    return '压缩包无效或已损坏，请重新选择文件'
  }

  if (lower.includes('zip file not found')) {
    return '找不到所选压缩包，请重新选择后上传'
  }

  if (
    lower === 'url is required' ||
    lower.includes('invalid url') ||
    lower.includes('url must be http')
  ) {
    return '下载地址无效，请确认技能来源后重试'
  }

  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('aborted')) {
    return '下载超时，请检查网络后重试'
  }

  if (lower.includes('too large') || lower.includes('file too large')) {
    return '技能包过大，超出允许大小，请更换后重试'
  }

  if (lower.includes('zip is empty') || lower.includes('downloaded zip is empty')) {
    return '下载的技能包为空，请确认下载地址后重试'
  }

  if (
    lower.includes('failed to download') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    /\bdownload(ed)?\b/i.test(text)
  ) {
    return '下载技能包失败，请检查网络后重试'
  }

  if (lower.includes('skill name not found')) {
    return 'SKILL.md 缺少必填字段 name，请补全后再安装'
  }

  if (lower.includes('skill description not found')) {
    return 'SKILL.md 缺少必填字段 description，请补全后再安装'
  }

  if (lower.includes('invalid skill name')) {
    return '技能 name 不合法，需为小写英文、数字、点、下划线或连字符'
  }

  if (lower.includes('already exists') || lower.includes('conflict')) {
    return '同名技能已存在，可选择覆盖安装'
  }

  if (lower.includes('only .md files')) {
    return '仅支持上传 .md 技能文件'
  }

  if (lower.includes('absolute paths are not allowed') || lower.includes('failed to read file')) {
    return '无法读取本地文件，请确认路径权限后重试'
  }

  if (lower.includes('skill not found') || lower.includes('not installed')) {
    if (context === 'uninstall') {
      return '未找到该技能，可能已卸载'
    }
  }

  // 仍含明显英文系统码时，给通用中文，避免整段 IPC 堆栈
  if (
    /\bENOENT\b|\bEPERM\b|\bEACCES\b|\bEBUSY\b/i.test(text) ||
    /deepchat:routeInvoke/i.test(text)
  ) {
    return systemFallbackByContext(context)
  }

  // 已是中文则原样返回
  if (/[\u4e00-\u9fff]/.test(text) && text.length <= 120) {
    return text
  }

  return fallbackByContext(context)
}

/** 卸载失败文案（语义与安装区分） */
export function formatSkillUninstallError(error: unknown): string {
  return formatSkillInstallError(error, 'uninstall')
}
