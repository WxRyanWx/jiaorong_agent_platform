const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/i
const PDF_EXT = /\.pdf$/i
const WORD_EXT = /\.(doc|docx|wps)$/i
const EXCEL_EXT = /\.(xls|xlsx|csv|numbers)$/i
const PPT_EXT = /\.(ppt|pptx)$/i
const MD_EXT = /\.(md|markdown)$/i
const HTML_EXT = /\.(html?|xhtml)$/i
const CSS_EXT = /\.css$/i
const XML_EXT = /\.xml$/i
const YAML_EXT = /\.ya?ml$/i
const AUDIO_EXT = /\.(mp3|wav|flac|aac|ogg|m4a)$/i
const TEXT_EXT = /\.(txt|json|js|ts|mjs|cjs)$/i

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function mimeFromFileName(fileName: string, fallback = ''): string {
  const name = fileName.trim()
  if (IMAGE_EXT.test(name)) {
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
    if (/\.gif$/i.test(name)) return 'image/gif'
    if (/\.webp$/i.test(name)) return 'image/webp'
    if (/\.svg$/i.test(name)) return 'image/svg+xml'
    if (/\.bmp$/i.test(name)) return 'image/bmp'
    return 'image/png'
  }
  if (PDF_EXT.test(name)) return 'application/pdf'
  if (WORD_EXT.test(name)) return WORD_MIME
  if (EXCEL_EXT.test(name)) return EXCEL_MIME
  if (PPT_EXT.test(name)) return PPT_MIME
  if (MD_EXT.test(name)) return 'text/markdown'
  if (HTML_EXT.test(name)) return 'text/html'
  if (CSS_EXT.test(name)) return 'text/css'
  if (XML_EXT.test(name)) return 'application/xml'
  if (YAML_EXT.test(name)) return 'application/x-yaml'
  if (AUDIO_EXT.test(name)) return 'audio/mpeg'
  if (TEXT_EXT.test(name)) return 'text/plain'
  return fallback || 'application/octet-stream'
}

export function isImageAttachment(fileName: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  return IMAGE_EXT.test(fileName)
}

export function getFileTypeIcon(fileName: string, mimeType?: string): string {
  const mime = (mimeType || mimeFromFileName(fileName)).toLowerCase()
  if (mime.startsWith('image/') || IMAGE_EXT.test(fileName)) {
    return 'vscode-icons:file-type-image'
  }
  if (mime.startsWith('text/plain') || mime.includes('json') || TEXT_EXT.test(fileName)) {
    return 'vscode-icons:file-type-text'
  }
  if (mime.startsWith('text/csv') || mime.includes('spreadsheet') || EXCEL_EXT.test(fileName)) {
    return 'vscode-icons:file-type-excel'
  }
  if (mime.startsWith('text/markdown') || MD_EXT.test(fileName)) {
    return 'vscode-icons:file-type-markdown'
  }
  if (mime.startsWith('application/x-yaml') || YAML_EXT.test(fileName)) {
    return 'vscode-icons:file-type-yaml'
  }
  if (mime.startsWith('application/xml') || XML_EXT.test(fileName)) {
    return 'vscode-icons:file-type-xml'
  }
  if (mime.startsWith('application/pdf') || PDF_EXT.test(fileName)) {
    return 'vscode-icons:file-type-pdf2'
  }
  if (
    mime.startsWith('application/msword') ||
    mime.includes('wordprocessingml') ||
    WORD_EXT.test(fileName)
  ) {
    return 'vscode-icons:file-type-word'
  }
  if (mime.includes('presentationml') || PPT_EXT.test(fileName)) {
    return 'vscode-icons:file-type-powerpoint'
  }
  if (mime.startsWith('text/html') || HTML_EXT.test(fileName)) {
    return 'vscode-icons:file-type-html'
  }
  if (mime.startsWith('text/css') || CSS_EXT.test(fileName)) {
    return 'vscode-icons:file-type-css'
  }
  if (mime.startsWith('audio/') || AUDIO_EXT.test(fileName)) {
    return 'vscode-icons:file-type-audio'
  }
  return 'vscode-icons:default-file'
}
