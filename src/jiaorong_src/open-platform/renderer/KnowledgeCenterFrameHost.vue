<script setup lang="ts">
/**
 * 问答中心 iframe 常驻宿主：与 RouterView 同级渲染，不随 keep-alive 移出文档。
 * 切换一级菜单时只把整块移出视口，iframe 的浏览上下文和问答状态都保留。
 */

import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { knowledgeCenterFrame } from './knowledgeCenterFrame'

defineOptions({ name: 'KnowledgeCenterFrameHost' })

/** 开放平台页标记内容区的属性：iframe 需要严丝合缝盖住它，避开顶栏和 tab。 */
const ANCHOR_SELECTOR = '[data-knowledge-center-anchor]'

const hostRef = ref<HTMLElement | null>(null)
/** iframe 相对宿主的摆放位置，随窗口尺寸和锚点变化刷新。 */
const frameBox = reactive({ top: 0, left: 0, width: 0, height: 0 })
let resizeObserver: ResizeObserver | null = null

/** 按锚点实际位置摆放 iframe。 */
function measureFrameBox(): void {
  const host = hostRef.value
  const anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR)
  if (!host || !anchor) return

  const hostRect = host.getBoundingClientRect()
  const anchorRect = anchor.getBoundingClientRect()
  frameBox.top = anchorRect.top - hostRect.top
  frameBox.left = anchorRect.left - hostRect.left
  frameBox.width = anchorRect.width
  frameBox.height = anchorRect.height
}

/** 锚点会随页面重建，每次显示都重新绑定观察。 */
function syncFrameBox(): void {
  const anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR)
  resizeObserver?.disconnect()
  resizeObserver = null

  if (anchor && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureFrameBox())
    resizeObserver.observe(anchor)
  }
  measureFrameBox()
}

watch(
  () => knowledgeCenterFrame.active,
  async (active) => {
    if (!active) return
    // 等 data-active 生效再量：宿主刚从视口外移回来，立刻量会拿到旧坐标
    await nextTick()
    syncFrameBox()
  }
)

/** 窗口尺寸变化时重算位置；宿主隐藏时页面可能已不在文档里，不必测量。 */
function handleWindowResize(): void {
  if (!knowledgeCenterFrame.active) return
  measureFrameBox()
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
  if (!knowledgeCenterFrame.active) return
  void nextTick().then(syncFrameBox)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="hostRef"
    class="knowledge-center-frame-host"
    :data-active="knowledgeCenterFrame.active ? 'true' : 'false'"
    :aria-hidden="!knowledgeCenterFrame.active"
  >
    <iframe
      v-if="knowledgeCenterFrame.url"
      class="knowledge-center-frame-host__frame"
      :style="{
        top: `${frameBox.top}px`,
        left: `${frameBox.left}px`,
        width: `${frameBox.width}px`,
        height: `${frameBox.height}px`
      }"
      :src="knowledgeCenterFrame.url"
      title="问答中心"
      allow="clipboard-read; clipboard-write"
      referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
    />
  </div>
</template>

<style scoped>
/* 宿主铺满父容器，不激活时整块移出视口，iframe 不会被销毁 */
.knowledge-center-frame-host {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 只有 iframe 区域接收事件，顶栏和 tab 保持可点 */
  pointer-events: none;
}

.knowledge-center-frame-host[data-active='false'] {
  left: -100%;
  z-index: -1;
}

.knowledge-center-frame-host__frame {
  position: absolute;
  /* 尺寸直接取自锚点 border-box，带边框也不会溢出 */
  box-sizing: border-box;
  border: 1px solid var(--open-platform-border, #e5e9f5);
  border-radius: 0;
  background: var(--open-platform-panel, #ffffff);
  pointer-events: auto;
}
</style>
