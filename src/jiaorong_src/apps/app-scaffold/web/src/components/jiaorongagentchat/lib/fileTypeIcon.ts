/**
 * 按文件名 / MIME 推断类型图标与 MIME。
 * 给附件芯片、输入区待发文件选 vscode-icons 名称使用。
 */

/** 常见图片扩展名。 */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/i
/** PDF 扩展名。 */
const PDF_EXT = /\.pdf$/i
/** Word / WPS 扩展名。 */
const WORD_EXT = /\.(doc|docx|wps)$/i
/** Excel / CSV / Numbers 扩展名。 */
const EXCEL_EXT = /\.(xls|xlsx|csv|numbers)$/i
/** PowerPoint 扩展名。 */
const PPT_EXT = /\.(ppt|pptx)$/i
/** Markdown 扩展名。 */
const MD_EXT = /\.(md|markdown)$/i
/** HTML 扩展名。 */
const HTML_EXT = /\.(html?|xhtml)$/i
/** CSS 扩展名。 */
const CSS_EXT = /\.css$/i
/** XML 扩展名。 */
const XML_EXT = /\.xml$/i
/** YAML 扩展名。 */
const YAML_EXT = /\.ya?ml$/i
/** 常见音频扩展名。 */
const AUDIO_EXT = /\.(mp3|wav|flac|aac|ogg|m4a)$/i
/** 纯文本与常见脚本扩展名。 */
const TEXT_EXT = /\.(txt|json|js|ts|mjs|cjs)$/i

/** OOXML Word MIME，给 docx 兜底。 */
const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** OOXML Excel MIME，给 xlsx 兜底。 */
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** OOXML PPT MIME，给 pptx 兜底。 */
const PPT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * 只靠文件名猜 MIME；浏览器 File.type 为空时的兜底。
 * @param fileName 文件名或路径末段
 * @param fallback 都匹配不上时的返回值；空则用 `application/octet-stream`
 * @returns 推断出的 MIME
 */
export function mimeFromFileName(fileName: string, fallback = ''): string {
  /** 去掉首尾空白后的文件名，用来匹配扩展名。 */
  const name = fileName.trim()
  // 图片族：按具体后缀给更准的 MIME，方便预览
  if (IMAGE_EXT.test(name)) {
    // jpeg / jpg
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
    // gif
    if (/\.gif$/i.test(name)) return 'image/gif'
    // webp
    if (/\.webp$/i.test(name)) return 'image/webp'
    // svg
    if (/\.svg$/i.test(name)) return 'image/svg+xml'
    // bmp
    if (/\.bmp$/i.test(name)) return 'image/bmp'
    // png / ico / avif / heic 等统一按 png 族处理，足够选图标
    return 'image/png'
  }
  if (PDF_EXT.test(name)) return 'application/pdf' // PDF
  if (WORD_EXT.test(name)) return WORD_MIME // Word / WPS
  if (EXCEL_EXT.test(name)) return EXCEL_MIME // Excel / CSV
  if (PPT_EXT.test(name)) return PPT_MIME // PPT
  if (MD_EXT.test(name)) return 'text/markdown' // Markdown
  if (HTML_EXT.test(name)) return 'text/html' // HTML
  if (CSS_EXT.test(name)) return 'text/css' // CSS
  if (XML_EXT.test(name)) return 'application/xml' // XML
  if (YAML_EXT.test(name)) return 'application/x-yaml' // YAML
  if (AUDIO_EXT.test(name)) return 'audio/mpeg' // 音频
  if (TEXT_EXT.test(name)) return 'text/plain' // 纯文本 / 脚本
  // 都认不出：用调用方兜底或通用二进制
  return fallback || 'application/octet-stream'
}

/**
 * 判断附件是否按图片预览。
 * @param fileName 文件名
 * @param mimeType 已知 MIME；`image/` 前缀直接视为图片
 * @returns 是图片则为 true
 */
export function isImageAttachment(fileName: string, mimeType?: string): boolean {
  // 已知 MIME 是 image/*：直接当图片，不再看扩展名
  if (mimeType?.startsWith('image/')) return true
  return IMAGE_EXT.test(fileName)
}

/**
 * 按 MIME / 扩展名返回 Iconify 图标名。
 * @param fileName 文件名
 * @param mimeType 已知 MIME；空则先用 mimeFromFileName
 * @returns vscode-icons 集合里的图标 id
 */
export function getFileTypeIcon(fileName: string, mimeType?: string): string {
  /** 小写 MIME，空则先按文件名推断。 */
  const mime = (mimeType || mimeFromFileName(fileName)).toLowerCase()
  if (mime.startsWith('image/') || IMAGE_EXT.test(fileName)) {
    // 图片
    return 'vscode-icons:file-type-image'
  }
  if (mime.startsWith('text/plain') || mime.includes('json') || TEXT_EXT.test(fileName)) {
    // 文本 / JSON / 脚本
    return 'vscode-icons:file-type-text'
  }
  if (mime.startsWith('text/csv') || mime.includes('spreadsheet') || EXCEL_EXT.test(fileName)) {
    // 表格
    return 'vscode-icons:file-type-excel'
  }
  if (mime.startsWith('text/markdown') || MD_EXT.test(fileName)) {
    // Markdown
    return 'vscode-icons:file-type-markdown'
  }
  if (mime.startsWith('application/x-yaml') || YAML_EXT.test(fileName)) {
    // YAML
    return 'vscode-icons:file-type-yaml'
  }
  if (mime.startsWith('application/xml') || XML_EXT.test(fileName)) {
    // XML
    return 'vscode-icons:file-type-xml'
  }
  if (mime.startsWith('application/pdf') || PDF_EXT.test(fileName)) {
    // PDF
    return 'vscode-icons:file-type-pdf2'
  }
  if (
    mime.startsWith('application/msword') ||
    mime.includes('wordprocessingml') ||
    WORD_EXT.test(fileName)
  ) {
    // Word
    return 'vscode-icons:file-type-word'
  }
  if (mime.includes('presentationml') || PPT_EXT.test(fileName)) {
    // PPT
    return 'vscode-icons:file-type-powerpoint'
  }
  if (mime.startsWith('text/html') || HTML_EXT.test(fileName)) {
    // HTML
    return 'vscode-icons:file-type-html'
  }
  if (mime.startsWith('text/css') || CSS_EXT.test(fileName)) {
    // CSS
    return 'vscode-icons:file-type-css'
  }
  if (mime.startsWith('audio/') || AUDIO_EXT.test(fileName)) {
    // 音频
    return 'vscode-icons:file-type-audio'
  }
  return 'vscode-icons:default-file'
}
