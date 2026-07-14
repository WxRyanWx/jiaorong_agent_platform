import { clipboard, nativeImage } from 'electron'
import type { ScreenshotPayload } from '../contracts/types'

/** 将 RGBA 像素转换为 Electron 使用 BGRA 排列的 NativeImage。 */
export const rgbaToNativeImage = (
  rgba: Uint8Array,
  width: number,
  height: number
): Electron.NativeImage => {
  const bgra = Buffer.allocUnsafe(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2]
    bgra[i + 1] = rgba[i + 1]
    bgra[i + 2] = rgba[i]
    bgra[i + 3] = rgba[i + 3]
  }
  return nativeImage.createFromBitmap(bgra, { width, height })
}

/** 将截图载荷中的数组统一转换为 Uint8Array。 */
export const getPayloadBytes = (payload: ScreenshotPayload): Uint8Array => {
  if (payload.uint8 instanceof Uint8Array) return payload.uint8
  return Uint8Array.from(payload.uint8 || [])
}

/** 将编码后的图片字节写入系统剪贴板，并返回是否写入成功。 */
export const writeImageToClip = (uint8: number[] | Uint8Array): boolean => {
  const bytes = uint8 instanceof Uint8Array ? uint8 : Uint8Array.from(uint8 || [])
  if (!bytes.length) return false
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) return false
  clipboard.writeImage(image)
  return true
}

/** 从截图载荷生成标准 PNG Base64；无法解码时保留原始字节编码。 */
export const imageBase64FromPayload = (payload: ScreenshotPayload): string => {
  const bytes = getPayloadBytes(payload)
  if (!bytes.length) return ''
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  return image.isEmpty() ? Buffer.from(bytes).toString('base64') : image.toPNG().toString('base64')
}
