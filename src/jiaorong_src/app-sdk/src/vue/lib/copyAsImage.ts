function hostBridge() {
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法生成图片'))
    image.src = url
  })
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成图片'))
    }, 'image/png')
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function readPngBase64(result: unknown) {
  if (!result || typeof result !== 'object') return ''
  const value = (result as { pngBase64?: unknown }).pngBase64
  return typeof value === 'string' ? value.trim() : ''
}

async function stitchBase64Pngs(parts: string[]): Promise<Blob> {
  if (parts.length === 1) {
    const binary = atob(parts[0])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: 'image/png' })
  }
  const images: HTMLImageElement[] = []
  const urls: string[] = []
  try {
    for (const part of parts) {
      const url = `data:image/png;base64,${part}`
      urls.push(url)
      images.push(await loadImage(url))
    }
    const width = Math.max(1, ...images.map((image) => image.naturalWidth || image.width))
    const height = images.reduce((sum, image) => sum + (image.naturalHeight || image.height), 0)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.max(1, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法生成图片')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    let top = 0
    for (const image of images) {
      ctx.drawImage(image, 0, top)
      top += image.naturalHeight || image.height
    }
    return await canvasToPng(canvas)
  } finally {
    for (const url of urls) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}

async function capturePageArea(rect: { x: number; y: number; width: number; height: number }) {
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
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

function resolveScrollContainer(el: HTMLElement) {
  const container =
    (el.closest('.message-list-container') as HTMLElement | null) ||
    (el.closest('[data-testid="chat-page"]') as HTMLElement | null)
  return container && container !== el ? container : el
}

async function captureElementPngs(el: HTMLElement): Promise<string[]> {
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  const container = resolveScrollContainer(el)
  const originalScroll = container.scrollTop
  const pieces: string[] = []
  try {
    await delay(60)
    const containerRect = container.getBoundingClientRect()
    const targetRect = el.getBoundingClientRect()
    const targetHeight = Math.max(el.scrollHeight, targetRect.height)
    const windowH = containerRect.height
    const windowW = Math.max(1, containerRect.width)
    if (windowH < 1 || windowW < 1) throw new Error('截图区域无效')
    const targetTopInContent = container.scrollTop + (targetRect.y - containerRect.y)
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const targetBottom = Math.min(targetTopInContent + targetHeight, maxScrollTop + windowH)
    const effectiveH = Math.max(0, targetBottom - targetTopInContent)
    if (effectiveH < 1) throw new Error('截图区域无效')

    let captured = 0
    for (let i = 0; i < 30 && captured < effectiveH; i++) {
      const remainingTop = targetTopInContent + captured
      if (container !== el) {
        container.scrollTop = Math.max(0, Math.min(remainingTop, maxScrollTop))
        await delay(80)
      }
      const actualScroll = container.scrollTop
      const capTop = Math.max(remainingTop, actualScroll)
      const capBottom = Math.min(targetBottom, actualScroll + windowH)
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

export async function copyTextToClipboard(text: string) {
  const value = text.trim()
  if (!value) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
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

async function writePngToHost(blob: Blob) {
  const host = hostBridge()
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  const pngBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
  await host.invoke('clipboard.writeImage', { pngBase64 })
}

export async function copyElementAsPng(el: HTMLElement) {
  const pieces = await captureElementPngs(el)
  const blob = await stitchBase64Pngs(pieces)
  await writePngToHost(blob)
}
