import { nextTick, onUnmounted, shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'

const BOTTOM_THRESHOLD_PX = 80

export function useChatAutoScroll(options: {
  enabled: MaybeRefOrGetter<boolean>
  viewport: MaybeRefOrGetter<HTMLElement | null>
  followKey: MaybeRefOrGetter<unknown>
}) {
  const pinned = shallowRef(true)
  let frame = 0

  function distanceFromBottom(el: HTMLElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  function isNearBottom(el: HTMLElement) {
    return distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX
  }

  function scrollToLatest(force = false) {
    if (!toValue(options.enabled)) return
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

  function onUserScroll() {
    const el = toValue(options.viewport)
    if (!el) return
    pinned.value = isNearBottom(el)
  }

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
