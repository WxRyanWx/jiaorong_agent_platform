function trimFixed(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
}

/** 文件字节 → 可读大小；空/无效返回 `-` */
export function formatKnowledgeFileSize(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size) || size < 0) {
    return '-'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${trimFixed(size / 1024, 1)} KB`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${trimFixed(size / (1024 * 1024), 1)} MB`
  }
  return `${trimFixed(size / (1024 * 1024 * 1024), 2)} GB`
}
