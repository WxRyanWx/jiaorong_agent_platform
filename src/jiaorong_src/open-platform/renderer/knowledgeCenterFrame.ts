import { reactive } from 'vue'

/**
 * 问答中心 iframe 的常驻状态。
 * 页面只负责写入地址和显隐；真正的 iframe 由 KnowledgeCenterFrameHost 常驻持有，
 * 避免 keep-alive 把页面 DOM 移出文档时浏览器重建 iframe、丢掉问答状态。
 */
export const knowledgeCenterFrame = reactive({
  /** 是否应该显示在开放平台内容区。 */
  active: false,
  /** iframe 当前地址；只有地址变化才会触发重载。 */
  url: ''
})

/** 写入 iframe 地址，不改显隐。 */
export function setKnowledgeCenterFrameUrl(url: string): void {
  knowledgeCenterFrame.url = url
}

/** 显示常驻 iframe。 */
export function showKnowledgeCenterFrame(): void {
  if (!knowledgeCenterFrame.url) return
  knowledgeCenterFrame.active = true
}

/** 隐藏但保留 iframe，内部会话不受影响。 */
export function hideKnowledgeCenterFrame(): void {
  knowledgeCenterFrame.active = false
}

/** 开放平台页面销毁时释放，避免残留旧 token 的 iframe。 */
export function releaseKnowledgeCenterFrame(): void {
  knowledgeCenterFrame.active = false
  knowledgeCenterFrame.url = ''
}
