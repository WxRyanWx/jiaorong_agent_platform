import { nextTick, onUnmounted, shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'

/** 贴底判定像素阈值。 */
const BOTTOM_THRESHOLD_PX = 80

/** 聊天区贴底滚动。 */
export function useChatAutoScroll(options: {
  enabled: MaybeRefOrGetter<boolean>
  viewport: MaybeRefOrGetter<HTMLElement | null>
  followKey: MaybeRefOrGetter<unknown>
}) {
  /** 是否贴底。 */
  const pinned = shallowRef(true)
  /** requestAnimationFrame id。 */
  let frame = 0

  /** 距底部像素。 */
  function distanceFromBottom(el: HTMLElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  /** 是否靠近底部。 */
  function isNearBottom(el: HTMLElement) {
    return distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX
  }

  /** 滚到最新。 */
  function scrollToLatest(force = false) {
    if (!toValue(options.enabled)) return
    /** DOM 元素。 */
    const el = toValue(options.viewport)
    if (!el) return
    if (!force && !pinned.value) return
    if (force) pinned.value = true
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      el.scrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    })
  }

  /** 用户滚动时决定是否取消贴底。 */
  function onUserScroll() {
    /** DOM 元素。 */
    const el = toValue(options.viewport)
    if (!el) return
    pinned.value = isNearBottom(el)
  }

  /** 重新贴底。 */
  function pinToLatest() {
    pinned.value = true
    void nextTick(() => scrollToLatest(true))
  }

  watch(
    () => [toValue(options.enabled), toValue(options.followKey)] as const,
    ([enabled]) => {
      if (!enabled) return
      void nextTick(() => scrollToLatest())
    }
  )

  onUnmounted(() => {
    if (frame) cancelAnimationFrame(frame)
  })

  return {
    onUserScroll,
    pinToLatest,
    scrollToLatest
  }
}
