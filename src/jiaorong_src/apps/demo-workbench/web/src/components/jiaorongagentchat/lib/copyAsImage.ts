/**
 * 复制气泡文本，或把 DOM 截成 PNG 写入宿主剪贴板。
 * 给消息工具栏「复制」「复制为图片」使用；截图走 jiaorong.invoke。
 */

/** 取 `window.jiaorong`，浏览器独立打开时为 undefined。 */
function hostBridge() {
  return (
    window as Window & {
      jiaorong?: { invoke: (method: string, args?: unknown) => Promise<unknown> }
    }
  ).jiaorong
}

/** 等一帧布局稳定后再截图，避免滚完立刻 capture 裁到旧位置。 */
function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** 把 data URL 载入 Image，拼图时量宽高。 */
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    /** 离屏图片，只用来读 naturalWidth / naturalHeight。 */
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法生成图片'))
    image.src = url
  })
}

/** 把 canvas 导出成 PNG Blob。 */
function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      // toBlob 成功才有 blob，失败要让调用方中止复制
      if (blob) resolve(blob)
      else reject(new Error('无法生成图片'))
    }, 'image/png')
  })
}

/** 分块 btoa，避免超大截图一次展开 TypedArray。 */
function bytesToBase64(bytes: Uint8Array): string {
  /** 分块拼出的二进制字符串，最后交给 btoa。 */
  let binary = ''
  /** 每块 32KB，避免一次展开超大截图。 */
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 从宿主 capture 结果里取出 pngBase64；结构不对返回空串。 */
function readPngBase64(result: unknown) {
  // 非对象结果没有 pngBase64 字段
  if (!result || typeof result !== 'object') return ''
  /** 宿主返回的 PNG base64 原文。 */
  const value = (result as { pngBase64?: unknown }).pngBase64
  return typeof value === 'string' ? value.trim() : ''
}

/** 多段 PNG base64 竖向拼成一张；只有一段则直接解码。 */
async function stitchBase64Pngs(parts: string[]): Promise<Blob> {
  // 只有一段：直接解码，不必再走 canvas
  if (parts.length === 1) {
    /** atob 后的二进制串。 */
    const binary = atob(parts[0])
    /** 与 binary 等长的字节，用来组 Blob。 */
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: 'image/png' })
  }
  /** 已解码的各段图片，按顺序竖向拼接。 */
  const images: HTMLImageElement[] = []
  /** 对应 data URL，finally 里按需释放 blob:。 */
  const urls: string[] = []
  try {
    for (const part of parts) {
      /** 单段 PNG 的 data URL，给 Image 加载。 */
      const url = `data:image/png;base64,${part}`
      urls.push(url)
      images.push(await loadImage(url))
    }
    /** 画布宽度取最宽一段，避免窄图被裁。 */
    const width = Math.max(1, ...images.map((image) => image.naturalWidth || image.width))
    /** 各段高度之和，作为竖向拼图总高。 */
    const height = images.reduce((sum, image) => sum + (image.naturalHeight || image.height), 0)
    /** 离屏画布，白底再逐段 drawImage。 */
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.max(1, height)
    /** 2d 上下文；拿不到说明环境不支持截图。 */
    const ctx = canvas.getContext('2d')
    // 无 2d 上下文无法拼图
    if (!ctx) throw new Error('无法生成图片')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    /** 当前段要画到的 y 坐标。 */
    let top = 0
    for (const image of images) {
      ctx.drawImage(image, 0, top)
      top += image.naturalHeight || image.height
    }
    return await canvasToPng(canvas)
  } finally {
    for (const url of urls) {
      // 只有 blob: 需要 revoke，data URL 没有对象 URL
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}

/** 让宿主按视口矩形截一帧，返回 PNG base64。 */
async function capturePageArea(rect: { x: number; y: number; width: number; height: number }) {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  // 浏览器独立打开时没有宿主桥，无法截页面
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** 本帧截到的 PNG base64。 */
  const pngBase64 = readPngBase64(
    await host.invoke('capture.pageArea', {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  )
  // 宿主没给出有效 base64：当截图失败
  if (!pngBase64) throw new Error('截图失败')
  return pngBase64
}

/** 优先用消息列表滚动容器，避免只截到气泡自身的可见裁剪。 */
function resolveScrollContainer(el: HTMLElement) {
  /** 消息列表滚动容器；找不到则退回气泡自身。 */
  const container =
    (el.closest('.message-list-container') as HTMLElement | null) ||
    (el.closest('[data-testid="chat-page"]') as HTMLElement | null)
  return container && container !== el ? container : el
}

/** 按视口高度分段滚动并截取目标元素，最多 30 段。 */
async function captureElementPngs(el: HTMLElement): Promise<string[]> {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  // 没有 invoke 无法分段截页面
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** 实际滚动的列表容器。 */
  const container = resolveScrollContainer(el)
  /** 截完后要还原的滚动位置。 */
  const originalScroll = container.scrollTop
  /** 各段 PNG base64，最后交给 stitch。 */
  const pieces: string[] = []
  try {
    await delay(60)
    /** 滚动容器在视口中的矩形。 */
    const containerRect = container.getBoundingClientRect()
    /** 目标气泡当前可见矩形。 */
    const targetRect = el.getBoundingClientRect()
    /** 目标完整高度，含滚出视口的部分。 */
    const targetHeight = Math.max(el.scrollHeight, targetRect.height)
    /** 容器可视高度，即每段最多截这么高。 */
    const windowH = containerRect.height
    /** 容器可视宽度。 */
    const windowW = Math.max(1, containerRect.width)
    // 容器还没布局好：宽高为 0 截不到内容
    if (windowH < 1 || windowW < 1) throw new Error('截图区域无效')
    /** 目标顶边在内容坐标系中的位置。 */
    const targetTopInContent = container.scrollTop + (targetRect.y - containerRect.y)
    /** 容器能滚到的最大 scrollTop。 */
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    /** 目标底边，不超过内容可视末端。 */
    const targetBottom = Math.min(targetTopInContent + targetHeight, maxScrollTop + windowH)
    /** 实际需要截取的高度。 */
    const effectiveH = Math.max(0, targetBottom - targetTopInContent)
    // 目标和视口不相交：没有可截区域
    if (effectiveH < 1) throw new Error('截图区域无效')

    /** 已截过的高度，用来算下一段起点。 */
    let captured = 0
    for (let i = 0; i < 30 && captured < effectiveH; i++) {
      /** 本段尚未截到的内容顶边。 */
      const remainingTop = targetTopInContent + captured
      // 目标在列表里：先滚到未截到的顶部，等一帧再截
      if (container !== el) {
        container.scrollTop = Math.max(0, Math.min(remainingTop, maxScrollTop))
        await delay(80)
      }
      /** 滚完后的真实 scrollTop，可能被浏览器钳住。 */
      const actualScroll = container.scrollTop
      /** 本帧截取顶边（内容坐标）。 */
      const capTop = Math.max(remainingTop, actualScroll)
      /** 本帧截取底边（内容坐标）。 */
      const capBottom = Math.min(targetBottom, actualScroll + windowH)
      /** 本帧实际高度。 */
      const height = capBottom - capTop
      // 当前视口与目标不再相交，结束分段
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
      // 容器就是目标自身：没有内部滚动，截一帧即可
      if (container === el) break
    }
  } finally {
    container.scrollTop = originalScroll
  }
  // 循环结束仍无片段：区域算出来了但一帧都没截到
  if (pieces.length === 0) throw new Error('截图失败')
  return pieces
}

/**
 * 把文本写入系统剪贴板。
 * 优先 Clipboard API；不支持时用隐藏 textarea + execCommand。
 * @param text 要复制的正文；空串直接返回
 */
export async function copyTextToClipboard(text: string) {
  /** 去掉首尾空白后的正文；空串不写剪贴板。 */
  const value = text.trim()
  // 没有可复制文本：直接返回，避免写入空串
  if (!value) return
  // 现代浏览器优先 Clipboard API
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  /** 隐藏 textarea，给不支持 Clipboard API 的环境 execCommand。 */
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

/** 把 PNG Blob 经宿主写入系统剪贴板。 */
async function writePngToHost(blob: Blob) {
  /** 当前页的宿主桥。 */
  const host = hostBridge()
  // 浏览器独立打开写不了系统图片剪贴板
  if (!host?.invoke) throw new Error('当前环境不支持复制图片')
  /** 交给 clipboard.writeImage 的 PNG base64。 */
  const pngBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
  await host.invoke('clipboard.writeImage', { pngBase64 })
}

/**
 * 把指定 DOM 截成一张 PNG 并写入宿主剪贴板。
 * @param el 气泡根节点；会沿消息列表分段滚动截取
 */
export async function copyElementAsPng(el: HTMLElement) {
  /** 分段截到的 PNG base64。 */
  const pieces = await captureElementPngs(el)
  /** 拼成一张后的 PNG。 */
  const blob = await stitchBase64Pngs(pieces)
  await writePngToHost(blob)
}
