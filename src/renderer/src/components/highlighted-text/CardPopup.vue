<template>
  <div class="card-popup" @contextmenu="(e) => e.preventDefault()">
    <div class="inner">
      <div class="logo-wrap" @mousedown="handleDragMouseDown">
        <img :src="drag" alt="drag" class="drag-img" />
        <img :src="logo" alt="logo" class="logo-img" />
      </div>
      <div class="line"></div>
      <div class="actions-wrap">
        <button class="action-item" @click.stop="translate" @pointerdown.prevent.stop>
          <img :src="translateIcon" alt="translate" class="icon" />
          <span class="label">划词翻译</span>
        </button>
        <button class="action-item" @click.stop="explain" @pointerdown.prevent.stop>
          <img :src="aiFileIcon" alt="explain" class="icon" />
          <span class="label">解释</span>
        </button>
        <button class="action-item" @click.stop="copy" @pointerdown.prevent.stop>
          <img :src="copyIcon" alt="copy" class="icon" />
          <span class="label">复制</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { createHighlightedTextClient } from '@api/HighlightedTextClient'

const route = useRoute()
const logo = new URL('../../../../../resources/icon.png', import.meta.url).href
const drag = new URL('../../../../../resources/drag.svg', import.meta.url).href
const translateIcon = new URL('../../../../../resources/translate.svg', import.meta.url).href
const aiFileIcon = new URL('../../../../../resources/AIfile.svg', import.meta.url).href
const copyIcon = new URL('../../../../../resources/copy.svg', import.meta.url).href
const highlightedTextClient = createHighlightedTextClient()

// 首次创建窗口时主进程会把文本带在 query 上，作为 IPC 文本推送的第一层兜底。
const readRouteText = () => {
  const text = String(route.query.text || '')
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const decodedText = ref(readRouteText())
let translateThrottled = false
let explainThrottled = false

// CardPopup 独立窗口没有主应用 store 上下文，登录态从主进程读取。
const readToken = async () => {
  return (await highlightedTextClient.getAuthToken()) || ''
}

const requireLogin = async () => {
  const token = await readToken()
  if (token) return false
  highlightedTextClient.showLogin()
  return true
}

// 接收主进程推送的最新划词文本，后续按钮操作都从 decodedText 读取。
const handleTextMessage = (_event: unknown, payload: { text?: string }) => {
  decodedText.value = payload?.text || ''
}

let cleanupCardPopupText: (() => void) | null = null

onMounted(() => {
  cleanupCardPopupText = highlightedTextClient.onCardPopupText((payload) => {
    handleTextMessage(null, payload)
  })
  // 首次打开时可能错过 card-popup-text 事件，挂载后主动向主进程兜底拉取一次。
  void highlightedTextClient.getCurrentCardPopupText().then((text) => {
    if (text && !decodedText.value) {
      decodedText.value = text
    }
  })
})

onUnmounted(() => {
  cleanupCardPopupText?.()
  cleanupCardPopupText = null
})

const copy = () => {
  if (!decodedText.value) return
  highlightedTextClient.copyText(decodedText.value, true)
}

const translate = async () => {
  if (translateThrottled || (await requireLogin())) return
  if (!decodedText.value) {
    // 点击时再兜底读取一次，避免用户点击早于 mounted 兜底完成。
    const currentText = await highlightedTextClient.getCurrentCardPopupText()
    decodedText.value = currentText
  }
  if (!decodedText.value) {
    return
  }
  highlightedTextClient.showTranslation(decodedText.value)
  translateThrottled = true
  setTimeout(() => {
    translateThrottled = false
  }, 400)
}

const explain = async () => {
  // 旧项目解释调用未迁移，这里只通知主进程关闭划词面板。
  if (explainThrottled) return
  highlightedTextClient.explain(decodedText.value)
  explainThrottled = true
  setTimeout(() => {
    explainThrottled = false
  }, 1000)
}

let isDragging = false
const handleDragMouseDown = (e: MouseEvent) => {
  // 无边框窗口拖拽由主进程 setPosition 实现，避免依赖系统标题栏。
  if (e.button !== 0) return
  isDragging = true
  highlightedTextClient.startWindowDrag(e.screenX, e.screenY)

  const move = (evt: MouseEvent) => {
    if (!isDragging) return
    highlightedTextClient.moveWindowDrag(evt.screenX, evt.screenY)
  }
  const up = () => {
    isDragging = false
    highlightedTextClient.endWindowDrag()
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }

  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
  e.preventDefault()
}
</script>

<style scoped>
.card-popup {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  -webkit-app-region: no-drag;
}

.inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0 3px;
  box-sizing: border-box;
}

.logo-wrap {
  display: flex;
  align-items: center;
  height: 100%;
}

.drag-img {
  width: 18px;
  height: 18px;
  -webkit-user-drag: none;
}

.logo-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  -webkit-user-drag: none;
}

.line {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: #c9cdd4;
}

.actions-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  -webkit-app-region: no-drag;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 1px 3px;
  margin-left: 2px;
  color: #1d2129;
  background: transparent;
  border: 0;
  cursor: pointer;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.action-item:hover {
  background: #f2f3f5;
  border-radius: 6px;
}

.icon {
  width: 16px;
  height: 16px;
  margin-right: 2px;
}

.label {
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
}
</style>
