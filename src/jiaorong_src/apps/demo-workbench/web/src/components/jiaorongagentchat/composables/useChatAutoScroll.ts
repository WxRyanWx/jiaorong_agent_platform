/**
 * 消息列表自动贴底滚动。
 * 给 JiaorongAgentChat 在新内容到来、用户上翻查看历史时决定是否跟着滚到底。
 */

import { nextTick, onUnmounted, shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'

/** 距底部小于该像素视为「仍在底部」，继续跟随。单位：px。 */
const BOTTOM_THRESHOLD_PX = 80

/**
 * 按视口与 followKey 自动滚到最新消息。
 * @param options.enabled 功能开关；false 时不滚动
 * @param options.viewport 可滚动的消息容器
 * @param options.followKey 内容指纹；变化且仍贴底时滚到最新
 * @returns onUserScroll 用户滚动时更新贴底状态；pinToLatest 强制贴底；scrollToLatest 滚到最新
 */
export function useChatAutoScroll(options: {
  enabled: MaybeRefOrGetter<boolean>
  viewport: MaybeRefOrGetter<HTMLElement | null>
  followKey: MaybeRefOrGetter<unknown>
}) {
  /** true 表示用户仍靠近底部，新内容到来时跟着滚。 */
  const pinned = shallowRef(true)
  /** 合并同一帧内多次滚动请求的 animationFrame id。 */
  let frame = 0

  /** 计算滚动容器距底部的像素距离。 */
  function distanceFromBottom(el: HTMLElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  /** 距底部小于阈值则视为仍贴底，可继续跟随。 */
  function isNearBottom(el: HTMLElement) {
    return distanceFromBottom(el) <= BOTTOM_THRESHOLD_PX
  }

  /**
   * 把视口滚到最新消息。
   * @param force true 时无视 pinned，发送后强制贴底
   */
  function scrollToLatest(force = false) {
    // 功能关闭：保持用户当前滚动位置
    if (!toValue(options.enabled)) return
    /** 当前可滚动的消息容器。 */
    const el = toValue(options.viewport)
    // 视口尚未挂上：等下次 followKey 再试
    if (!el) return
    // 用户已上翻看历史，且不是发送后的强制贴底
    if (!force && !pinned.value) return
    // 强制贴底：先恢复跟随，避免下一帧又被 pinned=false 挡住
    if (force) pinned.value = true
    // 同一帧已排过滚动：取消旧帧，只留最后一次
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      el.scrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    })
  }

  /** 用户滚动时根据距底距离更新 pinned。 */
  function onUserScroll() {
    /** 当前可滚动的消息容器。 */
    const el = toValue(options.viewport)
    // 视口已卸掉：没有可测的滚动位置
    if (!el) return
    pinned.value = isNearBottom(el)
  }

  /** 发送或切会话后强制贴底，并在下一帧滚到最新。 */
  function pinToLatest() {
    pinned.value = true
    void nextTick(() => scrollToLatest(true))
  }

  watch(
    () => [toValue(options.enabled), toValue(options.followKey)] as const,
    ([enabled]) => {
      // 开关关掉后不再抢滚动条
      if (!enabled) return
      void nextTick(() => scrollToLatest())
    }
  )

  onUnmounted(() => {
    // 卸载时取消未执行的滚动帧，避免操作已卸 DOM
    if (frame) cancelAnimationFrame(frame)
  })

  return {
    onUserScroll,
    pinToLatest,
    scrollToLatest
  }
}
