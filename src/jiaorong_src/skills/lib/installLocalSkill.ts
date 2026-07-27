import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate'
import type { SkillInstallResult } from '@shared/types/skill'
import { useLegacyPresenter } from '@api/legacy/presenters'

/**
 * 后端原始技能 SKILL.md 格式（skills 2 扫描结果）：
 * A 标准 YAML（合法 name）
 * B YAML 但 name 非法（中文 / 空格 / 大写等）
 * C YAML 无 name（用 title/summary）
 * E YAML 无 description
 * F **name:** / **description:** 正文写法
 * G 标题后再跟 --- name/description ---（延迟 frontmatter）
 * H 无 --- 的裸 name:/slug:/description:
 * I 仅有 # 标题 + 正文
 *
 * 上传时统一转成开源可识别的标准 YAML，不修改用户源文件。
 */

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/** 常见落盘目录名：不宜当作技能技术 name */
const GENERIC_PARENT_DIR_NAMES = new Set([
  'downloads',
  'download',
  'desktop',
  'documents',
  'document',
  'tmp',
  'temp',
  'pics',
  'pictures',
  'movies',
  'music',
  'videos',
  'images',
  'screenshots'
])

export function normalizeLocalPath(input: string): string {
  let p = input.trim()
  if (p.startsWith('@/')) {
    p = p.slice(1)
  } else if (p.startsWith('@') && (p[1] === '/' || p[1] === '\\')) {
    p = p.slice(1)
  }
  return p
}

function normalizeNewlines(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function pathBasename(filePath: string): string {
  return filePath.split(/[/\\]/).filter(Boolean).pop() || 'skill'
}

function isSkillMdFileName(name: string): boolean {
  return name.toLowerCase() === 'skill.md'
}

export function isGenericSkillParentDirName(name: string): boolean {
  return GENERIC_PARENT_DIR_NAMES.has(name.trim().toLowerCase())
}

/** 从原始 SKILL.md 窥探展示名（不写盘） */
export function peekSkillDisplayName(content: string): string {
  const text = normalizeNewlines(content)
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
  const bold = parseBoldFields(text)
  if (bold.displayName) return bold.displayName
  const delayed = parseDelayedYaml(text)
  if (delayed?.displayName) return delayed.displayName
  const bare = parseBareYamlHeader(text)
  if (bare?.displayName) return bare.displayName
  const leading = extractLeadingYaml(text)
  if (leading) {
    const rawName = parseYamlField(leading.fm, 'name')
    const fromMeta =
      parseYamlField(leading.fm, 'displayName') ||
      parseYamlField(leading.fm, 'title') ||
      (rawName && !SKILL_NAME_PATTERN.test(rawName) ? rawName : '')
    if (fromMeta) return fromMeta
  }
  return heading
}

/** 中文等无法进 name 时，用展示名生成稳定 ascii 技术 id */
export function stableAsciiSkillId(seed: string): string {
  const text = seed.trim() || 'skill'
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `skill-${(hash >>> 0).toString(36)}`.slice(0, 64)
}

/** sanitize 后过短、纯数字、或中文被剥成碎片时视为弱 id */
function isWeakSanitizedSkillName(original: string, sanitized: string): boolean {
  if (!sanitized || !SKILL_NAME_PATTERN.test(sanitized)) return true
  if (sanitized === 'skill-import' || sanitized.startsWith('skill-import')) return true
  if (sanitized.length < 3 || /^\d+$/.test(sanitized)) return true
  // 原文含非 ascii，sanitize 后只剩短碎片（如「…标准123」→ 123）
  if (/[^\x00-\x7F]/.test(original) && sanitized.length < 8) return true
  return false
}

/**
 * 推导安装用技术 name。
 * - 路径提示已是合法且非 Downloads 等落盘目录时优先用路径
 * - 否则用展示名 sanitize；中文等无效/弱 id 时用稳定 hash
 */
export function deriveTechnicalSkillName(content: string, pathHint?: string): string {
  const rawHint = pathHint?.trim() || ''
  const hintBase = rawHint ? pathBasename(rawHint) : ''
  if (hintBase && !isGenericSkillParentDirName(hintBase)) {
    const fromPath = sanitizeSkillName(hintBase)
    if (!isWeakSanitizedSkillName(hintBase, fromPath)) {
      return fromPath
    }
  }

  const display = peekSkillDisplayName(content)
  if (display) {
    const fromDisplay = sanitizeSkillName(display)
    if (!isWeakSanitizedSkillName(display, fromDisplay)) {
      return fromDisplay
    }
    return stableAsciiSkillId(display)
  }

  if (hintBase && !isGenericSkillParentDirName(hintBase)) {
    const fallback = sanitizeSkillName(hintBase)
    if (!isWeakSanitizedSkillName(hintBase, fallback)) {
      return fallback
    }
  }
  return stableAsciiSkillId(content.slice(0, 200) || 'skill')
}

function looksLikeInstallFrontmatterError(error?: string): boolean {
  if (!error) return false
  return (
    error.includes('Skill name not found') ||
    error.includes('Skill description not found') ||
    error.includes('Invalid skill name') ||
    error.includes('SKILL.md not found')
  )
}

/** 开源安装要求：name 匹配 /^[a-z0-9][a-z0-9._-]*$/ */
export function sanitizeSkillName(raw: string): string {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.{2,}/g, '.')
  if (!s || !/^[a-z0-9]/.test(s)) {
    s = `skill-${s || 'import'}`.replace(/[^a-z0-9._-]+/g, '-')
  }
  if (!SKILL_NAME_PATTERN.test(s)) {
    s = `skill-${Date.now().toString(36)}`
  }
  return s.slice(0, 64)
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

/** 解析 YAML 块内 description（含 | / > 多行） */
function parseYamlDescription(fm: string): string {
  const descLine = fm.match(/^description:\s*(.*)$/m)
  if (!descLine) return ''
  const rest = descLine[1].trim()
  if (rest === '|' || rest === '>' || rest === '>-' || rest === '|-') {
    const after = fm.slice(fm.indexOf(descLine[0]) + descLine[0].length)
    const lines: string[] = []
    for (const line of after.split('\n')) {
      if (!line.trim()) {
        if (lines.length) lines.push('')
        continue
      }
      if (/^\S/.test(line) && !line.startsWith(' ') && !line.startsWith('\t')) {
        break
      }
      lines.push(line.replace(/^\s{1,2}/, '').trimEnd())
    }
    return lines.join('\n').trim()
  }
  return unquote(rest)
}

function parseYamlField(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m ? unquote(m[1]) : ''
}

function extractLeadingYaml(content: string): { fm: string; body: string } | null {
  const text = normalizeNewlines(content).trimStart()
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  return {
    fm: text.slice(3, end).replace(/^\n/, ''),
    body: text.slice(end + 4).replace(/^\n/, '')
  }
}

/** F: **name:** / **description:** */
function parseBoldFields(content: string): { displayName?: string; description?: string } {
  const nameMatch = content.match(/\*\*name:\*\*\s*(.+)/i)
  const descMatch = content.match(/\*\*description:\*\*\s*([\s\S]+?)(?=\n\n|\n---|\n#|$)/i)
  return {
    displayName: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.replace(/\s+/g, ' ').trim()
  }
}

/** G: 标题后延迟 frontmatter */
function parseDelayedYaml(content: string): {
  displayName?: string
  description?: string
  body: string
} | null {
  const text = normalizeNewlines(content).trimStart()
  if (text.startsWith('---')) return null

  const match = text.match(/^([\s\S]*?)\n---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return null

  const prefix = match[1].trim()
  const fm = match[2]
  const rest = match[3]
  if (!/^name:\s*/m.test(fm) && !/^description:\s*/m.test(fm) && !/^slug:\s*/m.test(fm)) {
    return null
  }

  const displayName =
    parseYamlField(fm, 'name') || parseYamlField(fm, 'title') || parseYamlField(fm, 'slug')
  const description = parseYamlDescription(fm) || parseYamlField(fm, 'summary')
  const heading = prefix.match(/^#\s+(.+)$/m)?.[1]?.trim()

  return {
    displayName: displayName || heading,
    description: description || heading,
    body: [prefix, rest].filter(Boolean).join('\n\n').trimStart()
  }
}

/** H: 无 --- 的裸 name:/slug:/description: */
function parseBareYamlHeader(content: string): {
  displayName?: string
  description?: string
  body: string
} | null {
  const text = normalizeNewlines(content).trimStart()
  if (text.startsWith('---')) return null
  if (text.startsWith('#')) return null
  if (!/^(name|slug):\s*/m.test(text)) return null

  // 从文件开头扫到第一个以 # 开头的行，收集 kv / 多行 description
  const lines = text.split('\n')
  const fmLines: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('#')) break
    if (!line.trim()) {
      if (fmLines.some((l) => l.startsWith('description:'))) {
        const next = lines[i + 1]
        if (next && (next.startsWith(' ') || next.startsWith('\t') || next.startsWith('>'))) {
          fmLines.push(line)
          i += 1
          continue
        }
        i += 1
        break
      }
      i += 1
      continue
    }
    if (
      /^(name|slug|description|title|summary):\s*/.test(line) ||
      line.startsWith(' ') ||
      line.startsWith('\t')
    ) {
      fmLines.push(line)
      i += 1
      continue
    }
    break
  }

  const block = fmLines.join('\n')
  if (!/^(name|slug):\s*/m.test(block)) return null

  const displayName =
    parseYamlField(block, 'name') || parseYamlField(block, 'title') || parseYamlField(block, 'slug')
  const description = parseYamlDescription(block) || parseYamlField(block, 'summary')
  const body = lines.slice(i).join('\n').trimStart()

  return {
    displayName: displayName || undefined,
    description: description || undefined,
    body
  }
}

function firstProseParagraph(body: string): string {
  const lines = body.split('\n')
  const buf: string[] = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (buf.length) break
      continue
    }
    if (!line.trim()) {
      if (buf.length) break
      continue
    }
    if (line.startsWith('|') || line.startsWith('-') || line.startsWith('*')) {
      if (buf.length) break
      continue
    }
    buf.push(line.trim())
    if (buf.join(' ').length > 160) break
  }
  return buf.join(' ').slice(0, 300)
}

export function needsSkillMarkdownNormalize(content: string): boolean {
  const text = normalizeNewlines(content).trimStart()
  const leading = extractLeadingYaml(text)
  if (!leading) return true

  const name = parseYamlField(leading.fm, 'name')
  if (!name || !SKILL_NAME_PATTERN.test(name)) return true

  const desc = parseYamlDescription(leading.fm)
  if (!desc) return true

  return false
}

function buildStandardSkillMarkdown(params: {
  name: string
  description: string
  displayName: string
  body: string
}): string {
  const { name, description, displayName, body } = params
  const descYaml =
    description.includes('\n') || description.length > 120 || /[:#"']/.test(description)
      ? `|\n  ${description.replace(/\n/g, '\n  ')}`
      : description
  const displayYaml = /[^\x00-\x7F]|[:#"']/.test(displayName)
    ? JSON.stringify(displayName)
    : displayName
  const bodyText = body.replace(/^\n+/, '')
  return (
    `---\nname: ${name}\ndescription: ${descYaml}\nmetadata:\n  displayName: ${displayYaml}\n---\n\n` +
    bodyText +
    (bodyText.endsWith('\n') ? '' : '\n')
  )
}

/**
 * 将任意后端原始 SKILL.md 转为开源可识别的标准 YAML 头。
 * @param fallbackName 优先用目录名 / zip 名（稳定且合法）
 */
export function ensureSkillMarkdown(content: string, fallbackName: string): string {
  const technicalName = sanitizeSkillName(fallbackName)
  const text = normalizeNewlines(content)
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const bold = parseBoldFields(text)
  const delayed = parseDelayedYaml(text)
  const bare = parseBareYamlHeader(text)
  const leading = extractLeadingYaml(text)

  let body = text
  let rawName = ''
  let description = ''
  let displayName = ''

  if (leading) {
    // A/B/C/E：文件头 YAML（可能 name 非法 / 缺 description / 用 title）
    rawName = parseYamlField(leading.fm, 'name')
    description = parseYamlDescription(leading.fm)
    displayName =
      parseYamlField(leading.fm, 'displayName') ||
      parseYamlField(leading.fm, 'title') ||
      (rawName && !SKILL_NAME_PATTERN.test(rawName) ? rawName : '') ||
      ''
    if (!description) {
      description = parseYamlField(leading.fm, 'summary')
    }
    body = leading.body
  } else if (delayed) {
    // G
    displayName = delayed.displayName || ''
    description = delayed.description || ''
    body = delayed.body
  } else if (bare) {
    // H
    displayName = bare.displayName || ''
    description = bare.description || ''
    body = bare.body
    rawName = bare.displayName && SKILL_NAME_PATTERN.test(bare.displayName) ? bare.displayName : ''
  } else if (bold.displayName || bold.description) {
    // F
    displayName = bold.displayName || ''
    description = bold.description || ''
    body = text
      .replace(/\*\*name:\*\*\s*.+\n?/gi, '')
      .replace(/\*\*description:\*\*\s*[\s\S]*?(?=\n\n|\n---|\n#)/gi, '')
      .replace(/^\n*---\n+/, '\n')
  } else {
    // I：仅标题/正文
    displayName = heading || ''
    description = firstProseParagraph(text) || heading || ''
    body = text
  }

  // 清理正文残留的粗体 meta
  body = body
    .replace(/\*\*name:\*\*\s*.+\n?/gi, '')
    .replace(/\*\*description:\*\*\s*[\s\S]*?(?=\n\n|\n---|\n#)/gi, '')
    .replace(/^\n+/, '')

  const name = rawName && SKILL_NAME_PATTERN.test(rawName) ? rawName : technicalName
  // 已有合法 name 时优先用作展示回退，避免仅因缺标题而落入 hash 技术名
  displayName = displayName || heading || name || technicalName
  description =
    description ||
    bold.description ||
    heading ||
    firstProseParagraph(body) ||
    `Skill: ${technicalName}`

  return buildStandardSkillMarkdown({
    name,
    description,
    displayName,
    body
  })
}

type InstallDeps = {
  writeTemp: (file: {
    name: string
    content: string | Buffer | ArrayBuffer | Uint8Array
  }) => Promise<string>
  installFromFolder: (
    folderPath: string,
    options?: { overwrite?: boolean }
  ) => Promise<SkillInstallResult>
  installFromZip: (
    zipPath: string,
    options?: { overwrite?: boolean }
  ) => Promise<SkillInstallResult>
}

async function writePatchedSkillZip(
  folderName: string,
  skillMdContent: string,
  writeTemp: InstallDeps['writeTemp']
): Promise<string> {
  const safeFolder = sanitizeSkillName(folderName)
  const patched = ensureSkillMarkdown(skillMdContent, safeFolder)
  const zipped = zipSync({
    [`${safeFolder}/SKILL.md`]: strToU8(patched)
  })
  return writeTemp({
    name: `${safeFolder}.zip`,
    content: zipped
  })
}

const MAX_FOLDER_PACK_FILES = 500

type FolderFileEntry = { absPath: string; zipKey: string; isSkillMd: boolean }

/**
 * 通过已有 workspacePresenter 列目录（不改宿主），打包文件夹并规范化 SKILL.md，保留附属文件。
 */
async function writePatchedFolderZip(
  folderPath: string,
  writeTemp: InstallDeps['writeTemp']
): Promise<string> {
  const workspacePresenter = useLegacyPresenter('workspacePresenter', { safeCall: false })
  const root = folderPath.replace(/[/\\]+$/, '')
  // 先用占位扫描；读到 SKILL.md 后再用内容推导最终目录名
  let rootName = sanitizeSkillName(pathBasename(root))

  await workspacePresenter.registerWorkspace(root)
  try {
    const files: FolderFileEntry[] = []

    const walk = async (dir: string, relParts: string[]): Promise<void> => {
      if (files.length >= MAX_FOLDER_PACK_FILES) return
      const nodes = await workspacePresenter.readDirectory(dir)
      for (const node of nodes) {
        if (files.length >= MAX_FOLDER_PACK_FILES) break
        if (node.isDirectory) {
          await walk(node.path, [...relParts, node.name])
          continue
        }
        const zipKey = [...relParts, node.name].join('/')
        files.push({
          absPath: node.path,
          zipKey,
          isSkillMd: isSkillMdFileName(node.name)
        })
      }
    }

    await walk(root, [])

    const skillMd = files.find((f) => f.isSkillMd)
    if (!skillMd) {
      throw new Error('SKILL.md not found in folder')
    }

    const skillMdContent = await readLocalText(skillMd.absPath)
    rootName = deriveTechnicalSkillName(skillMdContent, pathBasename(root))

    const entries: Record<string, Uint8Array> = {}
    for (const file of files) {
      const zipKey = `${rootName}/${file.zipKey}`
      if (file.isSkillMd) {
        entries[zipKey] = strToU8(ensureSkillMarkdown(skillMdContent, rootName))
      } else {
        entries[zipKey] = await readLocalBinary(file.absPath)
      }
    }

    const zipped = zipSync(entries)
    return writeTemp({
      name: `${rootName}.zip`,
      content: zipped
    })
  } finally {
    try {
      await workspacePresenter.unregisterWorkspace(root)
    } catch {
      // ignore cleanup errors
    }
  }
}

function toFileUrl(filePath: string): string {
  if (filePath.startsWith('file:')) return filePath

  // Windows: C:\a\b → C:/a/b；统一正斜杠后再拼 file URL
  let normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    // file:///C:/Users/...
    normalized = `/${normalized}`
  } else if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  const encoded = normalized
    .split('/')
    .map((seg) => {
      if (seg === '') return ''
      // 保留盘符冒号，避免 C: 被编成 C%3A
      if (/^[a-zA-Z]:$/.test(seg)) return seg
      return encodeURIComponent(seg)
    })
    .join('/')

  return `file://${encoded}`
}

/** @internal 导出供单测 */
export function toFileUrlForTest(filePath: string): string {
  return toFileUrl(filePath)
}

/** 读取本机绝对路径文本（不走 file.readFile，避免 Absolute paths are not allowed） */
export async function readLocalText(filePath: string): Promise<string> {
  const bytes = await readLocalBinary(filePath)
  return new TextDecoder('utf-8').decode(bytes)
}

async function readLocalBinary(filePath: string): Promise<Uint8Array> {
  const response = await fetch(toFileUrl(filePath))
  if (!response.ok) {
    throw new Error(`Failed to read file: ${filePath}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

/** 解压 zip → 规范化 SKILL.md（保留其它文件）→ 再安装 */
async function installNormalizedZipBytes(params: {
  zipBytes: Uint8Array
  fallbackName?: string
  overwrite?: boolean
  writeTemp: InstallDeps['writeTemp']
  installFromZip: InstallDeps['installFromZip']
  forceNormalize?: boolean
}): Promise<SkillInstallResult> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(params.zipBytes)
  } catch {
    return { success: false, error: 'Invalid zip archive', errorCode: 'invalid_skill' }
  }

  const skillMdKey = Object.keys(entries).find((k) => {
    const base = k.split('/').pop() || ''
    return isSkillMdFileName(base) && !k.endsWith('/')
  })
  if (!skillMdKey) {
    return {
      success: false,
      error: 'SKILL.md not found in zip archive',
      errorCode: 'invalid_skill'
    }
  }

  const folderFromPath = skillMdKey.includes('/')
    ? skillMdKey.split('/').slice(0, -1).filter(Boolean).pop()
    : params.fallbackName
  const folderName = sanitizeSkillName(folderFromPath || params.fallbackName || 'skill')
  const original = strFromU8(entries[skillMdKey])

  if (!params.forceNormalize && !needsSkillMarkdownNormalize(original)) {
    // 已是标准格式，直接装原 zip 内容（仍写临时 zip 以统一路径）
    const tempZip = await params.writeTemp({
      name: `${folderName}.zip`,
      content: params.zipBytes
    })
    return params.installFromZip(tempZip, { overwrite: params.overwrite })
  }

  const patched = ensureSkillMarkdown(original, folderName)
  const next: Record<string, Uint8Array> = { ...entries }
  // 保持原 key 路径，避免打乱多文件结构；若在根目录则用 folder/SKILL.md
  if (skillMdKey.includes('/')) {
    next[skillMdKey] = strToU8(patched)
  } else {
    delete next[skillMdKey]
    next[`${folderName}/SKILL.md`] = strToU8(patched)
  }

  const zipped = zipSync(next)
  const tempZip = await params.writeTemp({
    name: `${folderName}.zip`,
    content: zipped
  })
  return params.installFromZip(tempZip, { overwrite: params.overwrite })
}

export async function installSkillFromMarkdown(
  params: {
    mdPath: string
    overwrite?: boolean
  } & InstallDeps
): Promise<SkillInstallResult> {
  const mdPath = normalizeLocalPath(params.mdPath)
  if (!mdPath.toLowerCase().endsWith('.md')) {
    return {
      success: false,
      error: 'Only .md files are supported',
      errorCode: 'invalid_skill'
    }
  }

  const fileName = pathBasename(mdPath)
  const content = await readLocalText(mdPath)

  // 上传 md：永远只装这一个文件。有附属资源时应走「上传文件夹 / zip」。
  // SKILL.md 不用父目录名当技术 id（避免 Downloads → downloads）。
  const pathHint = isSkillMdFileName(fileName) ? undefined : fileName.replace(/\.md$/i, '')

  // 已是开源可识别格式：原样单文件打包，避免 ensureSkillMarkdown 丢掉其它 frontmatter
  if (!needsSkillMarkdownNormalize(content)) {
    const leading = extractLeadingYaml(normalizeNewlines(content).trimStart())
    const fmName = leading ? parseYamlField(leading.fm, 'name') : ''
    const folderName =
      fmName && SKILL_NAME_PATTERN.test(fmName)
        ? fmName
        : deriveTechnicalSkillName(content, pathHint)
    const safeFolder = sanitizeSkillName(folderName)
    const tempZip = await params.writeTemp({
      name: `${safeFolder}.zip`,
      content: zipSync({
        [`${safeFolder}/SKILL.md`]: strToU8(normalizeNewlines(content))
      })
    })
    return params.installFromZip(tempZip, { overwrite: params.overwrite })
  }

  const folderHint = deriveTechnicalSkillName(content, pathHint)
  const tempZip = await writePatchedSkillZip(folderHint, content, params.writeTemp)
  return params.installFromZip(tempZip, { overwrite: params.overwrite })
}

export async function installSkillFromFolderCompat(
  params: {
    folderPath: string
    overwrite?: boolean
  } & InstallDeps
): Promise<SkillInstallResult> {
  const folderPath = normalizeLocalPath(params.folderPath)
  const skillMdPath = `${folderPath.replace(/[/\\]$/, '')}/SKILL.md`

  try {
    const content = await readLocalText(skillMdPath)
    if (needsSkillMarkdownNormalize(content)) {
      const tempZip = await writePatchedFolderZip(folderPath, params.writeTemp)
      return params.installFromZip(tempZip, { overwrite: params.overwrite })
    }
  } catch {
    // fall through
  }

  const result = await params.installFromFolder(folderPath, { overwrite: params.overwrite })
  if (result.success || !looksLikeInstallFrontmatterError(result.error)) {
    return result
  }

  try {
    const tempZip = await writePatchedFolderZip(folderPath, params.writeTemp)
    return params.installFromZip(tempZip, { overwrite: params.overwrite })
  } catch {
    return result
  }
}

/** zip：安装前主动规范化 SKILL.md，保留包内其它文件 */
export async function installSkillFromZipCompat(
  params: {
    zipPath: string
    /** 覆盖从 zip 路径推导的目录名（远程 URL 临时文件名无意义时传入） */
    fallbackName?: string
    overwrite?: boolean
  } & InstallDeps
): Promise<SkillInstallResult> {
  const zipPath = normalizeLocalPath(params.zipPath)
  const fallbackName = params.fallbackName?.trim() || pathBasename(zipPath).replace(/\.zip$/i, '')

  try {
    const bytes = await readLocalBinary(zipPath)
    // 先看包内 SKILL.md 是否需要转换
    const entries = unzipSync(bytes)
    const skillMdKey = Object.keys(entries).find((k) => {
      const base = k.split('/').pop() || ''
      return isSkillMdFileName(base) && !k.endsWith('/')
    })
    if (skillMdKey) {
      const original = strFromU8(entries[skillMdKey])
      if (needsSkillMarkdownNormalize(original)) {
        return installNormalizedZipBytes({
          zipBytes: bytes,
          fallbackName,
          overwrite: params.overwrite,
          writeTemp: params.writeTemp,
          installFromZip: params.installFromZip,
          forceNormalize: true
        })
      }
    }
  } catch {
    // 读包失败则回退直接安装
  }

  const result = await params.installFromZip(zipPath, { overwrite: params.overwrite })
  if (result.success || !looksLikeInstallFrontmatterError(result.error)) {
    return result
  }

  try {
    const bytes = await readLocalBinary(zipPath)
    return await installNormalizedZipBytes({
      zipBytes: bytes,
      fallbackName,
      overwrite: params.overwrite,
      writeTemp: params.writeTemp,
      installFromZip: params.installFromZip,
      forceNormalize: true
    })
  } catch {
    return result
  }
}

/**
 * 从远程 zip URL 基名推导安装目录名（去掉 .zip 与尾部 semver）。
 * 例：24-bills-building-quantities-1.0.0.zip → 24-bills-building-quantities
 */
export function fallbackNameFromRemoteZipUrl(url: string): string {
  try {
    const base = new URL(url).pathname.split('/').pop() || 'skill'
    return sanitizeSkillName(base.replace(/\.zip$/i, '').replace(/-\d+\.\d+\.\d+[a-z0-9.-]*$/i, ''))
  } catch {
    const base = url.split(/[\\/]/).pop() || 'skill'
    return sanitizeSkillName(base.replace(/\.zip$/i, '').replace(/-\d+\.\d+\.\d+[a-z0-9.-]*$/i, ''))
  }
}

/** 内存中的 zip 字节：规范化后安装（远程市场下载用） */
export async function installSkillFromZipBytesCompat(
  params: {
    zipBytes: Uint8Array
    fallbackName: string
    overwrite?: boolean
  } & InstallDeps
): Promise<SkillInstallResult> {
  return installNormalizedZipBytes({
    zipBytes: params.zipBytes,
    fallbackName: params.fallbackName,
    overwrite: params.overwrite,
    writeTemp: params.writeTemp,
    installFromZip: params.installFromZip,
    forceNormalize: false
  })
}
