<template>
  <div class="pin-wrap">
    <div v-if="imageSrc" class="pin-image-stage">
      <img class="pin-image" :src="imageSrc" alt="pin-by-pic" />
    </div>
    <div v-else class="empty">等待图片数据...</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const imageSrc = ref('')
let listener: ((...args: unknown[]) => void) | null = null

const closeWindow = (): void => {
  window.close()
}

const applyImagePayload = (payload: unknown): void => {
  const data = (payload ?? {}) as { imageBase64?: string }
  const base64 = String(data.imageBase64 || '')
  imageSrc.value = base64 ? `data:image/png;base64,${base64}` : ''
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeWindow()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)

  const onMessage = window?.api?.onMessage
  if (typeof onMessage !== 'function') return
  listener = onMessage('pin-by-pic-image', applyImagePayload)
  // 首次创建窗口时主进程可能早于 renderer 监听器发送图片，因此挂载后主动兜底读取一次。
  window?.api?.getPinByPicImage?.().then(applyImagePayload).catch(() => {})
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (listener) {
    window?.api?.removeMessageListener?.('pin-by-pic-image', listener)
    listener = null
  }
})
</script>

<style scoped>
.pin-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  overflow: hidden;
}

.pin-image-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pin-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  user-select: none;
  -webkit-user-drag: none;
}

.empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
}
</style>
