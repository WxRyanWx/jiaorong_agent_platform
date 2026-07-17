export type AuxiliaryCapturedMonitor = {
  id: number
  name: string
  width: number
  height: number
  uint8: Uint8Array
}

export type AuxiliaryRequest = {
  type: 'desktop-auxiliary:request'
  id: number
  method: 'capture:displays'
}

export type AuxiliaryResponse =
  | { type: 'desktop-auxiliary:response'; id: number; ok: true; data?: unknown }
  | {
      type: 'desktop-auxiliary:response'
      id: number
      ok: false
      error: { message: string; stack?: string }
    }
