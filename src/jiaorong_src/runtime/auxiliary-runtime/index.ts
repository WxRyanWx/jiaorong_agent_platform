import { createRequire } from 'node:module'
import type { AuxiliaryCapturedMonitor, AuxiliaryRequest, AuxiliaryResponse } from './contracts'

const require = createRequire(import.meta.url)
const port = process.parentPort

if (!port) {
  throw new Error('Desktop auxiliary runtime requires an Electron utility-process parent port.')
}

const captureDisplays = async (): Promise<AuxiliaryCapturedMonitor[]> => {
  const screenshots = require('node-screenshots') as {
    Monitor: {
      all: () => Array<{
        id: () => number
        name: () => string
        captureImage: () => Promise<{
          width: number
          height: number
          toRaw: () => Promise<Uint8Array | Buffer>
        }>
      }>
    }
  }
  return await Promise.all(
    screenshots.Monitor.all().map(async (monitor) => {
      const image = await monitor.captureImage()
      const raw = await image.toRaw()
      return {
        id: monitor.id(),
        name: monitor.name(),
        width: image.width,
        height: image.height,
        uint8: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      }
    })
  )
}

const handleRequest = async (request: AuxiliaryRequest): Promise<unknown> => {
  switch (request.method) {
    case 'capture:displays':
      return await captureDisplays()
  }
}

port.on('message', async (event) => {
  const request = event.data as AuxiliaryRequest
  if (request?.type !== 'desktop-auxiliary:request') return
  let response: AuxiliaryResponse
  try {
    response = {
      type: 'desktop-auxiliary:response',
      id: request.id,
      ok: true,
      data: await handleRequest(request)
    }
  } catch (error) {
    response = {
      type: 'desktop-auxiliary:response',
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    }
  }
  port.postMessage(response)
})
