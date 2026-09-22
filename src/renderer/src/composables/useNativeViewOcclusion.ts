import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

/**
 * Renderer overlays (Mermaid/Infographic fullscreen, dialogs, spotlight) cannot
 * cover YoBrowser. It is a native BrowserView above the page, so CSS z-index
 * never wins. Hide the native view whenever one of these overlays is present.
 */
export const NATIVE_VIEW_OCCLUSION_SELECTOR = [
  '.mermaid-modal-overlay',
  '.infographic-modal-overlay',
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-overlay"]',
  '.spotlight-overlay'
].join(',')

export function hasNativeViewOcclusion(root: ParentNode = document): boolean {
  return root.querySelector(NATIVE_VIEW_OCCLUSION_SELECTOR) !== null
}

export function useNativeViewOcclusion() {
  const isOccluded = shallowRef(false)
  let observer: MutationObserver | null = null

  const refresh = () => {
    isOccluded.value = hasNativeViewOcclusion()
  }

  onMounted(() => {
    refresh()
    observer = new MutationObserver(refresh)
    // Mermaid keeps a `markstream-vue` portal on body and only mounts the
    // overlay inside it. Body childList alone never sees open/close.
    observer.observe(document.body, { childList: true, subtree: true })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { isOccluded }
}
