import { nativeImage } from 'electron'
import type { SessionCaptureCachePayload, SessionCaptureTile } from './sessionCaptureCache'

export type ExportSelectionBaseRequest = {
  imgX: number
  imgY: number
  imgW: number
  imgH: number
  outW: number
  outH: number
}

export type ExportSelectionBaseResult = {
  uint8: Buffer
  width: number
  height: number
}

const rgbaToBgraBuffer = (rgba: Uint8Array): Buffer => {
  const bgra = Buffer.allocUnsafe(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2]
    bgra[i + 1] = rgba[i + 1]
    bgra[i + 2] = rgba[i]
    bgra[i + 3] = rgba[i + 3]
  }
  return bgra
}

const getTileDestSize = (tile: SessionCaptureTile): { destW: number; destH: number } => ({
  destW: tile.destWidth || tile.width,
  destH: tile.destHeight || tile.height
})

/** 仅将 tile 与选区相交部分写入 crop 缓冲，避免拼接整幅 union 画布 */
const blitTileIntoCropRegion = (
  region: Uint8Array,
  regionW: number,
  regionH: number,
  regionOriginX: number,
  regionOriginY: number,
  tile: SessionCaptureTile
): void => {
  const { destW, destH } = getTileDestSize(tile)
  const tileLeft = tile.x
  const tileTop = tile.y
  const tileRight = tileLeft + destW
  const tileBottom = tileTop + destH
  const regionRight = regionOriginX + regionW
  const regionBottom = regionOriginY + regionH

  const intersectLeft = Math.max(tileLeft, regionOriginX)
  const intersectTop = Math.max(tileTop, regionOriginY)
  const intersectRight = Math.min(tileRight, regionRight)
  const intersectBottom = Math.min(tileBottom, regionBottom)
  if (intersectLeft >= intersectRight || intersectTop >= intersectBottom) return

  const scaleX = tile.width / destW
  const scaleY = tile.height / destH

  for (let y = intersectTop; y < intersectBottom; y += 1) {
    const dstRow = (y - regionOriginY) * regionW * 4 + (intersectLeft - regionOriginX) * 4
    for (let x = intersectLeft; x < intersectRight; x += 1) {
      const srcX = Math.min(tile.width - 1, Math.floor((x - tileLeft) * scaleX))
      const srcY = Math.min(tile.height - 1, Math.floor((y - tileTop) * scaleY))
      const srcIdx = (srcY * tile.width + srcX) * 4
      const dstIdx = dstRow + (x - intersectLeft) * 4
      region[dstIdx] = tile.uint8[srcIdx]
      region[dstIdx + 1] = tile.uint8[srcIdx + 1]
      region[dstIdx + 2] = tile.uint8[srcIdx + 2]
      region[dstIdx + 3] = tile.uint8[srcIdx + 3]
    }
  }
}

const rgbaToPngBuffer = (rgba: Uint8Array, width: number, height: number): Buffer => {
  const image = nativeImage.createFromBitmap(rgbaToBgraBuffer(rgba), { width, height })
  return image.toPNG()
}

const resizeRgba = (
  rgba: Uint8Array,
  width: number,
  height: number,
  outW: number,
  outH: number
): Uint8Array => {
  if (width === outW && height === outH) return rgba
  // 复用 Electron nativeImage 做缩放，避免为截图迁移重新引入 sharp 到这条链路。
  const image = nativeImage.createFromBitmap(rgbaToBgraBuffer(rgba), { width, height })
  const resized = image.resize({ width: outW, height: outH })
  return Uint8Array.from(resized.toBitmap())
}

export const exportSelectionBaseFromCache = (
  cache: SessionCaptureCachePayload,
  request: ExportSelectionBaseRequest
): ExportSelectionBaseResult | null => {
  if (!cache.frames.length) return null

  // request 坐标来自 tools-gui 选区，先规整为像素整数，防止 TypedArray 越界。
  const imgX = Math.max(0, Math.floor(request.imgX))
  const imgY = Math.max(0, Math.floor(request.imgY))
  const imgW = Math.max(1, Math.floor(request.imgW))
  const imgH = Math.max(1, Math.floor(request.imgH))
  const outW = Math.max(1, Math.floor(request.outW))
  const outH = Math.max(1, Math.floor(request.outH))

  const region = new Uint8Array(imgW * imgH * 4)
  for (const tile of cache.frames) {
    if (!tile.uint8?.length) continue
    blitTileIntoCropRegion(region, imgW, imgH, imgX, imgY, tile)
  }

  let rgba: Uint8Array<ArrayBufferLike> = region
  let cropW = imgW
  let cropH = imgH
  if (cropW !== outW || cropH !== outH) {
    rgba = resizeRgba(region, cropW, cropH, outW, outH)
    cropW = outW
    cropH = outH
  }

  return {
    uint8: rgbaToPngBuffer(rgba, cropW, cropH),
    width: cropW,
    height: cropH
  }
}
