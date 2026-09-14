/** 取 window.jiaorong 宿主桥。 */
function hostBridge() {
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

/** 等待指定毫秒。 */
function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** 加载图片元素。 */
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    /** 图片元素。 */
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法生成图片'))
    image.src = url
  })
}

/** canvas 导出 PNG。 */
function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成图片'))
    }, 'image/png')
  })
}

/** 字节转 base64。 */
function bytesToBase64(bytes: Uint8Array): string {
  /** 二进制拼出的字符串。 */
  let binary = ''
  /** 按块编码的字节长度。 */
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 读 PNG 的 base64。 */
function readPngBase64(result: unknown) {
  if (!result || typeof result !== 'object') return ''
  /** 待处理的值。 */
  const value = (result as { pngBase64?: unknown }).pngBase64
  return typeof value === 'string' ? value.trim() : ''
}

/** 把多张 PNG 竖向拼成一张。 */
async function stitchBase64Pngs(parts: string[]): Promise<Blob> {
  if (parts.length === 1) {
    /** 二进制拼出的字符串。 */
    const binary = atob(parts[0])
    /** 字节。 */
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: 'image/png' })
  }
  /** 图片列表。 */
  const images: HTMLImageElement[] = []
  /** URL 列表。 */
  const urls: string[] = []
  try {
    /** 一段 PNG。 */
    for (const part of parts) {
      /** URL。 */
      const url = `data:image/png;base64,${part}`
      urls.push(url)
      images.push(await loadImage(url))
    }
    /** 宽度。 */
    const width = Math.max(1, ...images.map((image) => image.naturalWidth || image.width))
    /** 高度。 */
    const height = images.reduce((sum, image) => sum + (image.naturalHeight || image.height), 0)
    /** 画布。 */
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.max(1, height)
    /** 2D 画布上下文。 */
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法生成图片')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    /** 当前滚动 top。 */
    let top = 0
    /** 一张图片。 */
    for (const image of images) {
      ctx.drawImage(image, 0, top)
      top += image.naturalHeight || image.height
    }
    return await canvasToPng(canvas)
  } finally {
    /** 一张图的 URL。 */
    for (const url of urls) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}

/** 截取页面区域。 */
async function capturePageArea(rect: { x: number; y: number; width: number; height: number }) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** PNG 的 base64。 */
  const pngBase64 = readPngBase64(
    await host.invoke('capture.pageArea', {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  )
  if (!pngBase64) throw new Error('截图失败')
  return pngBase64
}

/** 找可滚动容器。 */
function resolveScrollContainer(el: HTMLElement) {
  /** 容器元素。 */
  const container =
    (el.closest('.message-list-container') as HTMLElement | null) ||
    (el.closest('[data-testid="chat-page"]') as HTMLElement | null)
  return container && container !== el ? container : el
}

/** 把元素滚动分段截成多张 PNG。 */
async function captureElementPngs(el: HTMLElement): Promise<string[]> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** 容器元素。 */
  const container = resolveScrollContainer(el)
  /** 截图前的滚动位置。 */
  const originalScroll = container.scrollTop
  /** 分段截图。 */
  const pieces: string[] = []
  try {
    await delay(60)
    /** 容器矩形。 */
    const containerRect = container.getBoundingClientRect()
    /** 目标矩形。 */
    const targetRect = el.getBoundingClientRect()
    /** 目标高度。 */
    const targetHeight = Math.max(el.scrollHeight, targetRect.height)
    /** 窗口高度。 */
    const windowH = containerRect.height
    /** 窗口宽度。 */
    const windowW = Math.max(1, containerRect.width)
    if (windowH < 1 || windowW < 1) throw new Error('截图区域无效')
    /** 目标在内容中的 top。 */
    const targetTopInContent = container.scrollTop + (targetRect.y - containerRect.y)
    /** 最大可滚距离。 */
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    /** 目标下边界。 */
    const targetBottom = Math.min(targetTopInContent + targetHeight, maxScrollTop + windowH)
    /** 有效高度。 */
    const effectiveH = Math.max(0, targetBottom - targetTopInContent)
    if (effectiveH < 1) throw new Error('截图区域无效')

    /** 已截取的 PNG。 */
    let captured = 0
    for (let i = 0; i < 30 && captured < effectiveH; i++) {
      /** 剩余顶部距离。 */
      const remainingTop = targetTopInContent + captured
      if (container !== el) {
        container.scrollTop = Math.max(0, Math.min(remainingTop, maxScrollTop))
        await delay(80)
      }
      /** 实际滚动量。 */
      const actualScroll = container.scrollTop
      /** 截取上边界。 */
      const capTop = Math.max(remainingTop, actualScroll)
      /** 截取下边界。 */
      const capBottom = Math.min(targetBottom, actualScroll + windowH)
      /** 高度。 */
      const height = capBottom - capTop
      if (height < 1) break
      pieces.push(
        await capturePageArea({
          x: containerRect.left,
          y: containerRect.top + Math.max(0, capTop - actualScroll),
          width: windowW,
          height
        })
      )
      captured += height
      if (container === el) break
    }
  } finally {
    container.scrollTop = originalScroll
  }
  if (pieces.length === 0) throw new Error('截图失败')
  return pieces
}

/** 复制文本到剪贴板。 */
export async function copyTextToClipboard(text: string) {
  /** 待处理的值。 */
  const value = text.trim()
  if (!value) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  /** 输入框。 */
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

/** 把 PNG 交给宿主写剪贴板。 */
async function writePngToHost(blob: Blob) {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** PNG 的 base64。 */
  const pngBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
  await host.invoke('clipboard.writeImage', { pngBase64 })
}

/** 把元素复制成 PNG。 */
export async function copyElementAsPng(el: HTMLElement) {
  /** 分段截图。 */
  const pieces = await captureElementPngs(el)
  /** Blob。 */
  const blob = await stitchBase64Pngs(pieces)
  await writePngToHost(blob)
}
