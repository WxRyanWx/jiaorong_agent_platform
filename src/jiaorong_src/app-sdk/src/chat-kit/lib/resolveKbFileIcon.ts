import folderIcon from '../assets/kb-file-icons/icon-document-folder.png'
import excelIcon from '../assets/kb-file-icons/icon-document-excel.png'
import pdfIcon from '../assets/kb-file-icons/icon-document-pdf.png'
import pptIcon from '../assets/kb-file-icons/icon-document-ppt.png'
import txtIcon from '../assets/kb-file-icons/icon-document-txt.png'
import wordIcon from '../assets/kb-file-icons/icon-document-word.png'

/** 知识库文件图标种类。 */
export type KbFileIconKind = 'folder' | 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'unknown'

/** 文件名是否 PDF。 */
function isPdfFileName(fileName: string | undefined): boolean {
  return fileName ? /\.pdf$/i.test(fileName) : false
}

/** 文件名是否 Word。 */
function isWordFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(doc|docx|wps)$/i.test(fileName) : false
}

/** 文件名是否 Excel。 */
function isExcelFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(xls|xlsx|csv)$/i.test(fileName) : false
}

/** 文件名是否 PPT。 */
function isPptFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(ppt|pptx)$/i.test(fileName) : false
}

/** 文件名是否文本。 */
function isTxtFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(txt|md|markdown)$/i.test(fileName) : false
}

/** 知识库文件图标类型。 */
export function resolveKbFileIconKind(
  fileName: string | undefined,
  options?: { isDirectory?: boolean; extension?: string | null }
): KbFileIconKind {
  if (options?.isDirectory) return 'folder'
  /** 名称。 */
  const name =
    fileName ||
    (options?.extension ? `file.${String(options.extension).replace(/^\./, '')}` : undefined)
  if (isPdfFileName(name)) return 'pdf'
  if (isWordFileName(name)) return 'word'
  if (isExcelFileName(name)) return 'excel'
  if (isPptFileName(name)) return 'ppt'
  if (isTxtFileName(name)) return 'txt'
  return 'unknown'
}

/** 知识库文件图标地址。 */
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
      return txtIcon
  }
}
