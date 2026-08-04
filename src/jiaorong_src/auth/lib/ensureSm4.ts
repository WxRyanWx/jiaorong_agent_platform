/**
 * 按需注入 SM4 经典脚本（原 index.html 全局加载）。
 * 使用 ?raw + 同步注入，避免生产构建把小文件内联成 data: URL 后 script.src 加载失败。
 */
import s4Source from '../vendor/sm4/s4.js?raw'
import byteStringSource from '../vendor/sm4/byte-string.js?raw'
import smutilsSource from '../vendor/sm4/smutils.js?raw'

declare global {
  // eslint-disable-next-line no-var
  var Sm4utils:
    | (new (key: string) => {
        encryptData_ECB: (plaintext: unknown) => string | false
        decryptData_ECB: (ciphertext: unknown) => string | false
      })
    | undefined
}

let loaded = false

function injectClassicScript(id: string, source: string): void {
  if (document.getElementById(id)) {
    return
  }
  const script = document.createElement('script')
  script.id = id
  script.text = source
  document.head.appendChild(script)
}

export function isSm4Ready(): boolean {
  return typeof globalThis.Sm4utils === 'function'
}

export function ensureSm4Loaded(): Promise<void> {
  if (loaded && isSm4Ready()) {
    return Promise.resolve()
  }
  try {
    injectClassicScript('jiaorong-sm4-s4', s4Source)
    injectClassicScript('jiaorong-sm4-byte-string', byteStringSource)
    injectClassicScript('jiaorong-sm4-smutils', smutilsSource)
    if (!isSm4Ready()) {
      throw new Error('[jiaorong] Sm4utils not available after script inject')
    }
    loaded = true
    return Promise.resolve()
  } catch (error) {
    loaded = false
    return Promise.reject(error)
  }
}
