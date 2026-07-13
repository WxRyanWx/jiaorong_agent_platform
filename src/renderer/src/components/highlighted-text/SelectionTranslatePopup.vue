<template>
  <div class="translate-popup" @contextmenu="(e) => e.preventDefault()">
    <div class="titlebar" @mousedown="handleDragMouseDown">
      <button class="icon-button" @click.stop="close">x</button>
      <div class="grab-line"></div>
    </div>

    <div class="content">
      <label class="select-wrap">
        <span>译为</span>
        <select v-model="targetLang" @change="runTranslate">
          <option v-for="item in languages" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <section class="text-section">
        <div class="section-head">
          <span>原文：</span>
          <button class="copy-button" @click="copyText(sourceText)">复制</button>
        </div>
        <div class="text-main">{{ sourceText }}</div>
      </section>

      <div class="divider"></div>

      <section class="text-section">
        <div class="section-head">
          <span>译文：</span>
          <button
            class="copy-button"
            :disabled="!translationText"
            @click="copyText(translationText)"
          >
            复制
          </button>
        </div>
        <div class="text-main">
          <span v-if="loading" class="loading">翻译中...</span>
          <span v-else>{{ translationText }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { createHighlightedTextClient } from '@api/HighlightedTextClient'

const route = useRoute()
const highlightedTextClient = createHighlightedTextClient()
const ipcText = ref('')
const translationText = ref('')
const loading = ref(false)
const targetLang = ref('en')

const languages = [
  { label: '英语', value: 'en' },
  { label: '中文', value: 'zh-CN' },
  { label: '德语', value: 'de' },
  { label: '法语', value: 'fr' },
  { label: '日语', value: 'ja' },
  { label: '西班牙语', value: 'es' },
  { label: '葡萄牙语', value: 'pt' },
  { label: '韩语', value: 'ko' },
  { label: '意大利语', value: 'it' },
  { label: '俄语', value: 'ru' }
]

// 原文有三种来源：IPC 推送、路由 query、主进程缓存兜底；优先使用最新 IPC 文本。
const sourceText = computed(() => {
  const text = ipcText.value || String(route.query.text || '')
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
})

const close = () => {
  highlightedTextClient.closeTranslate()
}

const copyText = (text: string) => {
  if (!text) return
  highlightedTextClient.copyText(text)
}

const runTranslate = async () => {
  if (!sourceText.value.trim()) {
    // 首次窗口创建时可能错过 update-translation-text，翻译前再主动拉取一次。
    const currentText = await highlightedTextClient.getCurrentTranslatePopupText()
    if (currentText) {
      ipcText.value = currentText
    }
  }
  const text = sourceText.value.trim()
  if (!text) {
    return
  }
  loading.value = true
  translationText.value = ''
  try {
    // 实际翻译请求通过 preload 转到主进程，由主进程统一调用 chat-pc 翻译应用。
    translationText.value =
      (await highlightedTextClient.translateSelectedText(text, targetLang.value)) || ''
  } catch (error) {
    console.error('[SelectionTranslatePopup] translate failed:', error)
    translationText.value = '翻译失败，请重试。'
  } finally {
    loading.value = false
  }
}

const handleUpdateText = (_event: unknown, text: string) => {
  // 主进程推送新文本时立即更新原文并重新翻译。
  ipcText.value = text || ''
  void runTranslate()
}

let cleanupTranslationText: (() => void) | null = null

onMounted(() => {
  cleanupTranslationText = highlightedTextClient.onTranslationText((text) => {
    handleUpdateText(null, text)
  })
  // 挂载后先读取主进程缓存，解决首次打开时监听尚未注册导致原文为空的问题。
  void highlightedTextClient.getCurrentTranslatePopupText().then((text) => {
    if (text && !sourceText.value.trim()) {
      ipcText.value = text
    }
    void runTranslate()
  })
})

onUnmounted(() => {
  cleanupTranslationText?.()
  cleanupTranslationText = null
})

let isDragging = false
const handleDragMouseDown = (e: MouseEvent) => {
  // 翻译弹窗同样是无边框窗口，拖拽通过主进程移动窗口。
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button')) return
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
.translate-popup {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #1d2129;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-sizing: border-box;
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}

.titlebar {
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  height: 34px;
  cursor: move;
}

.icon-button {
  width: 24px;
  height: 24px;
  margin-left: 8px;
  font-size: 20px;
  line-height: 20px;
  color: #4e5969;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.grab-line {
  width: 36px;
  height: 3px;
  justify-self: center;
  background: #c9cdd4;
  border-radius: 999px;
}

.content {
  height: calc(100% - 34px);
  padding: 6px 16px 14px;
  box-sizing: border-box;
}

.select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  font-size: 13px;
  color: #4e5969;
}

select {
  flex: 1;
  height: 28px;
  color: #1d2129;
  background: #f7f8fa;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}

.text-section {
  margin-top: 8px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  font-size: 13px;
  font-weight: 600;
}

.copy-button {
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  color: #165dff;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.copy-button:disabled {
  color: #c9cdd4;
  cursor: default;
}

.text-main {
  height: 86px;
  margin-top: 4px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.divider {
  height: 1px;
  margin-top: 8px;
  background: #e5e6eb;
}

.loading {
  color: #86909c;
}
</style>
