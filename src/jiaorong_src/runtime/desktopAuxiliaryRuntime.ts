import { app, utilityProcess, type UtilityProcess } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AuxiliaryCapturedMonitor,
  AuxiliaryRequest,
  AuxiliaryResponse
} from './auxiliary-runtime/contracts'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

class DesktopAuxiliaryRuntime {
  private host: UtilityProcess | null = null
  private hostReady: Promise<UtilityProcess> | null = null
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private stderrTail = ''

  async captureDisplays(): Promise<AuxiliaryCapturedMonitor[]> {
    return (await this.request('capture:displays')) as AuxiliaryCapturedMonitor[]
  }

  shutdown(): void {
    const host = this.host
    this.host = null
    this.hostReady = null
    this.rejectPending(new Error('Desktop auxiliary runtime was shut down.'))
    if (host) host.kill()
  }

  private async request(method: AuxiliaryRequest['method']): Promise<unknown> {
    const host = await this.ensureHost()
    const id = this.nextRequestId++
    const request = {
      type: 'desktop-auxiliary:request',
      id,
      method
    } as AuxiliaryRequest
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        host.postMessage(request)
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private async ensureHost(): Promise<UtilityProcess> {
    if (this.host) return this.host
    if (this.hostReady) return await this.hostReady
    this.hostReady = this.startHost()
    try {
      return await this.hostReady
    } finally {
      this.hostReady = null
    }
  }

  private async startHost(): Promise<UtilityProcess> {
    this.stderrTail = ''
    const host = utilityProcess.fork(this.resolveEntryPoint(), [], {
      serviceName: 'JiaorongAI Desktop Auxiliary Runtime',
      stdio: 'pipe',
      env: { ...process.env },
      // macOS 原生 .node 模块需要由带 library-validation entitlement 的 Plugin Helper 加载。
      allowLoadingUnsignedLibraries: process.platform === 'darwin'
    })
    host.on('message', (message) => this.handleMessage(message))
    host.on('exit', (code) => this.handleExit(code))
    host.on('error', (type, location) => {
      console.error('[desktopAuxiliary] utility process error:', { type, location })
    })
    host.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8')
      this.stderrTail = `${this.stderrTail}${message}`.slice(-4000)
      console.error('[desktopAuxiliary] stderr:', message)
    })

    return await new Promise<UtilityProcess>((resolve, reject) => {
      const onSpawn = () => {
        host.off('exit', onEarlyExit)
        this.host = host
        resolve(host)
      }
      const onEarlyExit = (code: number) => {
        host.off('spawn', onSpawn)
        reject(new Error(`Desktop auxiliary runtime exited before spawn: ${code}`))
      }
      host.once('spawn', onSpawn)
      host.once('exit', onEarlyExit)
    })
  }

  private resolveEntryPoint(): string {
    const currentModule = fileURLToPath(import.meta.url)
    const candidates = [
      path.join(app.getAppPath(), 'out/main/desktopAuxiliaryRuntimeHost.js'),
      path.resolve(path.dirname(currentModule), 'desktopAuxiliaryRuntimeHost.js'),
      path.resolve(process.cwd(), 'out/main/desktopAuxiliaryRuntimeHost.js')
    ]
    return candidates.find(existsSync) ?? candidates[0]
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return
    const response = message as AuxiliaryResponse
    if (response.type !== 'desktop-auxiliary:response') return
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (response.ok) {
      pending.resolve(response.data)
    } else {
      const error = new Error(response.error.message)
      error.stack = response.error.stack ?? error.stack
      pending.reject(error)
    }
  }

  private handleExit(code: number): void {
    this.host = null
    this.hostReady = null
    const detail = this.stderrTail.trim()
    const error = new Error(
      `Desktop auxiliary runtime exited with code ${code}.${detail ? ` ${detail}` : ''}`
    )
    this.rejectPending(error)
    console.warn('[desktopAuxiliary] utility process exited:', {
      code,
      stderr: detail || undefined
    })
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }
}

export const desktopAuxiliaryRuntime = new DesktopAuxiliaryRuntime()
