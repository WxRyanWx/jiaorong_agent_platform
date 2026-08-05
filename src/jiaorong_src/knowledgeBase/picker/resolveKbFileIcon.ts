import folderIcon from '../../assets/kb-file-icons/icon-document-folder.png'
import excelIcon from '../../assets/kb-file-icons/icon-document-excel.png'
import pdfIcon from '../../assets/kb-file-icons/icon-document-pdf.png'
import pptIcon from '../../assets/kb-file-icons/icon-document-ppt.png'
import txtIcon from '../../assets/kb-file-icons/icon-document-txt.png'
import wordIcon from '../../assets/kb-file-icons/icon-document-word.png'

export type KbFileIconKind = 'folder' | 'pdf' | 'word' | 'excel' | 'ppt' | 'txt' | 'unknown'

export function isPdfFileName(fileName: string | undefined): boolean {
  return fileName ? /\.pdf$/i.test(fileName) : false
}

export function isWordFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(doc|docx|wps)$/i.test(fileName) : false
}

export function isExcelFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(xls|xlsx|csv)$/i.test(fileName) : false
}

export function isPptFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(ppt|pptx)$/i.test(fileName) : false
}

export function isTxtFileName(fileName: string | undefined): boolean {
  return fileName ? /\.(txt|md|markdown)$/i.test(fileName) : false
}

export function resolveKbFileIconKind(
  fileName: string | undefined,
  options?: { isDirectory?: boolean; extension?: string | null }
): KbFileIconKind {
  if (options?.isDirectory) return 'folder'

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

export function resolveKbFileIconSrc(
  fileName: string | undefined,
  options?: { isDirectory?: boolean; extension?: string | null }
): string {
  const kind = resolveKbFileIconKind(fileName, options)
  switch (kind) {
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
    case 'txt':
      return txtIcon
    default:
      return txtIcon
  }
}
