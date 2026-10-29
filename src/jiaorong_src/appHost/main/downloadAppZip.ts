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
/** 单个安装包体积上限，与开放平台发布侧一致。 */
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024

/**
 * 流式下载远程 zip 到临时文件，并顺带算 sha256。
 * @param downloadUrl 远程包地址
 * @param options headers：私有 API 需要鉴权头，公开直链不传
 */
export async function downloadAppZip(
  downloadUrl: string,
  options?: { headers?: Record<string, string> }
): Promise<{ zipPath: string; sha256: string }> {
  /** 下载响应。 */
  const response = await fetch(downloadUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    ...(options?.headers ? { headers: options.headers } : {})
  })
  // 非 200 或无 body 都算失败
  if (!response.ok || !response.body) {
    throw new Error(`download failed with status ${response.status}`)
  }
  /** 临时 zip 路径；带随机后缀，避免同一毫秒内并发下载写到同一个文件。 */
  const zipPath = path.join(
    os.tmpdir(),
    `jiaorong-app-zip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.zip`
  )
  /** sha256 累加器。 */
  const hash = createHash('sha256')
  /** 已接收字节数。 */
  let receivedBytes = 0
  /** 过水算哈希的透传流；顺便挡住异常大包，避免写满临时盘。 */
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length
      // 超出上限直接中断，pipeline 会 reject 并触发下面的临时文件清理
      if (receivedBytes > MAX_PACKAGE_BYTES) {
        callback(new Error('安装包超过 200MB 上限'))
        return
      }
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
