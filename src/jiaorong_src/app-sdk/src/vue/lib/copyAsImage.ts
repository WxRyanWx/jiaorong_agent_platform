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

async function renderElementPng(el: HTMLElement): Promise<Blob> {
  const width = Math.max(1, Math.ceil(el.scrollWidth || el.getBoundingClientRect().width))
  const height = Math.max(1, Math.ceil(el.scrollHeight || el.getBoundingClientRect().height))
  const clone = el.cloneNode(true) as HTMLElement
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法生成图片')
    const background = getComputedStyle(el).backgroundColor || '#ffffff'
    ctx.fillStyle = background === 'rgba(0, 0, 0, 0)' ? '#ffffff' : background
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0)
    return await canvasToPng(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
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

export async function copyElementAsPng(el: HTMLElement) {
  const blob = await renderElementPng(el)
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持复制图片')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
