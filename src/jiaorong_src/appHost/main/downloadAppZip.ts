/** 远程 zip 下载到临时文件，顺带算 sha256。应用中心与系统应用共用。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

/** 远程包下载超时。 */
const DOWNLOAD_TIMEOUT_MS = 300_000

/**
 * 流式下载远程 zip 到临时文件，并顺带算 sha256。
 * @param downloadUrl 远程包地址
 */
export async function downloadAppZip(
  downloadUrl: string
): Promise<{ zipPath: string; sha256: string }> {
  /** 下载响应。 */
  const response = await fetch(downloadUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  // 非 200 或无 body 都算失败
  if (!response.ok || !response.body) {
    throw new Error(`download failed with status ${response.status}`)
  }
  /** 临时 zip 路径。 */
  const zipPath = path.join(os.tmpdir(), `jiaorong-app-zip-${Date.now()}.zip`)
  /** sha256 累加器。 */
  const hash = createHash('sha256')
  /** 过水算哈希的透传流。 */
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    }
  })
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      hasher,
      fs.createWriteStream(zipPath)
    )
  } catch (error) {
    fs.rmSync(zipPath, { force: true })
    throw error
  }
  return { zipPath, sha256: hash.digest('hex') }
}
