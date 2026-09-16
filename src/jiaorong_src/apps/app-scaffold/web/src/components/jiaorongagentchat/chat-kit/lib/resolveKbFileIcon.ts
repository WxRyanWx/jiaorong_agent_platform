/**
 * 按文件名 / 扩展名 / 是否目录，解析知识库文件类型图标资源。
 */
import folderIcon from '../assets/kb-file-icons/icon-document-folder.png'
import excelIcon from '../assets/kb-file-icons/icon-document-excel.png'
import pdfIcon from '../assets/kb-file-icons/icon-document-pdf.png'
import pptIcon from '../assets/kb-file-icons/icon-document-ppt.png'
import txtIcon from '../assets/kb-file-icons/icon-document-txt.png'
import wordIcon from '../assets/kb-file-icons/icon-document-word.png'

/**
 * 知识库文件图标种类。`unknown` 走 txt 兜底图。
 */
export type KbFileIconKind = 'folder' | 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'unknown'

/** 是否 PDF。 */
function isPdfFileName(fileName: string | undefined): boolean {
  return fileName ? /\.pdf$/i.test(fileName) : false
}

/** 是否 Word / WPS 文档。 */
function isWordFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(doc|docx|wps)$/i.test(fileName) : false
}

/** 是否 Excel / CSV。 */
function isExcelFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(xls|xlsx|csv)$/i.test(fileName) : false
}

/** 是否 PPT。 */
function isPptFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(ppt|pptx)$/i.test(fileName) : false
}

/** 是否纯文本或 Markdown。 */
function isTxtFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(txt|md|markdown)$/i.test(fileName) : false
}

/**
 * 解析图标种类。目录优先；无文件名时用 extension 拼假名再匹配。
 */
export function resolveKbFileIconKind(
  fileName: string | undefined,
  options?: { isDirectory?: boolean; extension?: string | null }
): KbFileIconKind {
  // 目录不看扩展名
  if (options?.isDirectory) return 'folder'
  /** 用于匹配扩展名的文件名；缺省时用 extension 拼假名。 */
  const name =
    fileName ||
    (options?.extension ? `file.${String(options.extension).replace(/^\./, '')}` : undefined)
  // 按扩展名落到具体图标种类
  if (isPdfFileName(name)) return 'pdf' // PDF
  if (isWordFileName(name)) return 'word' // Word / WPS
  if (isExcelFileName(name)) return 'excel' // Excel / CSV
  if (isPptFileName(name)) return 'ppt' // PPT
  if (isTxtFileName(name)) return 'txt' // 文本 / Markdown
  // 认不出的类型走 txt 兜底图
  return 'unknown'
}

/**
 * 解析可直接给 `<img>` 用的图标 src。未知类型用 txt 图。
 */
export function resolveKbFileIconSrc(
  fileName: string | undefined,
  options?: { isDirectory?: boolean; extension?: string | null }
): string {
  switch (resolveKbFileIconKind(fileName, options)) {
    case 'folder':
      return folderIcon
    case 'pdf':
      return pdfIcon
    case 'word':
      return wordIcon
    case 'excel':
      return excelIcon
    case 'ppt':
      return pptIcon
    default:
      // txt / unknown 共用文本图标
      return txtIcon
  }
}
