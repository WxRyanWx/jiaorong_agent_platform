<template>
  <div class="wrap">
    <div class="panel">
      <div class="header">
        <div class="title">文字识别</div>
        <button class="close-btn" type="button" aria-label="关闭" @click="closeWindow">×</button>
      </div>

      <div class="body">
        <section class="column image-column" style="width: 393px">
          <!--          <div class="column-title">原始截图</div>-->
          <button
            v-if="imageSrc"
            type="button"
            class="image-box image-box--clickable"
            aria-label="点击预览大图"
            @click="openImagePreview"
          >
            <img class="preview-image" :src="imageSrc" alt="原始截图" />
            <span class="image-zoom-hint">点击预览</span>
          </button>
          <div v-else class="image-box">
            <div class="image-placeholder">加载中...</div>
          </div>
        </section>
        <section class="column text-column" style="border-left: 1px solid #ddd; height: 100%">
          <!--          <div class="column-title">识别预览区</div>-->
          <div class="preview-box">
            <div class="text1">识别预览</div>
            <div v-if="loading" class="preview-loading">识别中...</div>
            <div v-else-if="isEmpty" class="preview-tip">
              <div style="display: flex">
                <img
                  :src="exclamationCircle"
                  style="width: 16px; height: 16px; margin-top: 3px"
                  alt=""
                />
                <div style="margin-left: 8px">未识别到文字,当前仅支持中文或英文内容</div>
              </div>
            </div>
            <pre v-else class="preview-text">{{ recognizedText }}</pre>
          </div>
        </section>
      </div>

      <div class="footer">
        <button class="copy-btn" type="button" :disabled="!copyableText" @click="copyText">
          {{ copied ? '已复制' : '复制全文' }}
        </button>
      </div>
    </div>

    <div
      v-if="imagePreviewVisible && imageSrc"
      class="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="截图大图预览"
      @click.self="closeImagePreview"
    >
      <button class="lightbox-close" type="button" aria-label="关闭预览" @click="closeImagePreview">
        ×
      </button>
      <img class="lightbox-image" :src="imageSrc" alt="截图大图预览" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import exclamationCircle from '../assets/exclamation-circle.png'
const OCR_EMPTY_MESSAGE = '未识别到文字，当前仅支持中文或英文内容。'

const imageSrc = ref('')
const recognizedText = ref('')
const emptyMessage = ref(OCR_EMPTY_MESSAGE)
const isEmpty = ref(false)
const loading = ref(true)
const copied = ref(false)
const imagePreviewVisible = ref(false)
let listener: ((...args: unknown[]) => void) | null = null

const copyableText = computed(() => (isEmpty.value ? '' : recognizedText.value.trim()))

const closeWindow = (): void => {
  window.close()
}

const openImagePreview = (): void => {
  if (!imageSrc.value) return
  imagePreviewVisible.value = true
}

const closeImagePreview = (): void => {
  imagePreviewVisible.value = false
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    if (imagePreviewVisible.value) {
      closeImagePreview()
    } else {
      closeWindow()
    }
  }
}

const copyText = async (): Promise<void> => {
  const text = copyableText.value
  if (!text) return
  try {
    const copyByMain = window?.api?.copyTextByMain
    // OCR 弹窗是独立 BrowserWindow，优先走主进程复制，避免浏览器剪贴板权限差异。
    if (typeof copyByMain === 'function') {
      await copyByMain(text)
    } else {
      await navigator.clipboard.writeText(text)
    }
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1200)
  } catch {
    copied.value = false
  }
}

const applyOcrPayload = (payload: unknown): void => {
  const data = (payload ?? {}) as {
    imageBase64?: string
    text?: string
    empty?: boolean
    message?: string
    loading?: boolean
  }
  const base64 = String(data.imageBase64 || '')
  imageSrc.value = base64 ? `data:image/png;base64,${base64}` : ''
  recognizedText.value = String(data.text || '')
  isEmpty.value = !!data.empty
  emptyMessage.value = String(data.message || OCR_EMPTY_MESSAGE)
  loading.value = !!data.loading
}

const applyCachedOcrPayload = async (): Promise<void> => {
  const payload = await window?.api?.getOcrResultData?.()
  if (payload) applyOcrPayload(payload)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)

  const onMessage = window?.api?.onMessage
  if (typeof onMessage !== 'function') {
    loading.value = false
    isEmpty.value = true
    emptyMessage.value = OCR_EMPTY_MESSAGE
    return
  }
  listener = onMessage('ocr-result-data', applyOcrPayload)
  // OCR 可能在窗口加载前已经开始，挂载后主动读取主进程缓存，避免先显示旧图或空白。
  void applyCachedOcrPayload().catch(() => {})
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (listener) {
    window?.api?.removeMessageListener?.('ocr-result-data', listener)
    listener = null
  }
})
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.wrap {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  background: #ffffff;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1f2329;
}

.header {
  -webkit-app-region: drag;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e5e6eb;
}

.title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #646a73;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: #f2f3f5;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.column-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #646a73;
}

.image-box,
.preview-box {
  min-height: 0;
  background: white;
  box-sizing: border-box;
  overflow: hidden;
}
.image-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 364px;
  height: 253px;
  margin: 16px 20px;
  margin-right: 8px;
  box-sizing: border-box;
  position: relative;
}

.image-box--clickable {
  cursor: zoom-in;
  border: 1px solid #e5e6eb;
}

.image-box--clickable:hover {
  border-color: #94b4ff;
  box-shadow: 0 0 0 2px rgba(51, 112, 255, 0.12);
}

.image-box--clickable:hover .image-zoom-hint {
  opacity: 1;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.image-zoom-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-size: 12px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.image-placeholder,
.preview-loading {
  color: #8f959e;
  font-size: 13px;
}

.preview-box {
  padding: 16px 20px;
  overflow: auto;
  flex: 1;
  height: 285px;
  box-sizing: border-box;

  .text1 {
    font-size: 14px;
    color: #4e5969;
    text-align: left;
  }
}

.preview-tip {
  padding: 11px 16px;
  width: 234px;
  height: 63px;
  margin-top: 6px;
  background: #fff7e8;
  border-radius: 2px 2px 2px 2px;
}

.preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2329;
  font-family: inherit;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.footer {
  -webkit-app-region: no-drag;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;
  border-top: 1px solid #e5e6eb;
}

.copy-btn {
  min-width: 96px;
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: #3370ff;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}

.copy-btn:hover:not(:disabled) {
  background: #2b63eb;
}

.copy-btn:disabled {
  background: #c9cdd4;
  cursor: not-allowed;
}

.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.28);
}

.lightbox-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
