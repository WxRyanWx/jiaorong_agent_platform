<script setup lang="ts">
defineOptions({ name: 'OpenPlatformFeedbackEntry' })

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useToast } from '@/components/use-toast'
import { getToken } from '@jiaorong/auth/lib/local-user'
import { readStoredUserInfo } from '@jiaorong/config/storedUserInfo'
import {
  fetchFeedbackHasUnread,
  fetchFeedbackList,
  loadFeedbackImageObjectUrl,
  submitUserFeedback,
  uploadFeedbackImage
} from '@jiaorong/api/userFeedback'
import type { UserFeedbackRecord } from '@jiaorong/api/userFeedback/types'
import appraiseLogo from '../assets/appraise-logo.png'
import {
  FEEDBACK_IMAGE_LIMIT,
  FEEDBACK_RATING_LABELS,
  FEEDBACK_TEXT_LIMIT,
  buildFeedbackComment,
  canSubmitFeedback,
  clipFeedbackText,
  feedbackImageRejection,
  previewFeedbackComment,
  readFeedbackEditor,
  type FeedbackEditorState
} from './feedbackContent'

const { toast } = useToast()

const open = ref(false)
const view = ref<'form' | 'records'>('form')
const rating = ref(0)
const hoverRating = ref(0)
const uploading = ref(false)
const submitting = ref(false)
const hasUnread = ref(false)
const records = ref<UserFeedbackRecord[]>([])
const recordsLoading = ref(false)
const recordsError = ref('')
const imageUrls = ref<Record<string, string>>({})
const editorRef = ref<HTMLDivElement | null>(null)
const editorState = ref<FeedbackEditorState>({
  parts: [],
  textLength: 0,
  imageCount: 0,
  hasText: false
})

const localObjectUrls: string[] = []
let lastHtml = ''

const activeRating = computed(() => hoverRating.value || rating.value)
const canSubmit = computed(
  () => canSubmitFeedback(rating.value, editorState.value) && !uploading.value && !submitting.value
)

function isItemUnread(value: UserFeedbackRecord['isRead']): boolean {
  return value === 0 || value === false || value === '0'
}

function recordPreview(record: UserFeedbackRecord) {
  return previewFeedbackComment(record.comment ?? '')
}

function captureRange(): Range | null {
  const editor = editorRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return null
  return range.cloneRange()
}

function placeNode(node: Node, range: Range | null): void {
  const editor = editorRef.value
  if (!editor) return
  const selection = window.getSelection()
  if (!range) {
    editor.appendChild(node)
  } else {
    range.deleteContents()
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
  }
  const next = document.createRange()
  next.setStartAfter(node)
  next.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(next)
}

function syncEditor(): void {
  const editor = editorRef.value
  if (!editor) return
  const next = readFeedbackEditor(editor)
  if (next.textLength > FEEDBACK_TEXT_LIMIT) return
  editorState.value = next
  lastHtml = editor.innerHTML
}

function insertTextNode(text: string): void {
  if (!text) return
  placeNode(document.createTextNode(text), captureRange())
  syncEditor()
}

function revokeLocalUrls(): void {
  localObjectUrls.forEach((url) => URL.revokeObjectURL(url))
  localObjectUrls.length = 0
}

function resetForm(): void {
  rating.value = 0
  hoverRating.value = 0
  editorState.value = { parts: [], textLength: 0, imageCount: 0, hasText: false }
  lastHtml = ''
  if (editorRef.value) editorRef.value.innerHTML = ''
  revokeLocalUrls()
}

async function refreshUnread(): Promise<void> {
  if (!getToken()) {
    hasUnread.value = false
    return
  }
  try {
    hasUnread.value = await fetchFeedbackHasUnread()
  } catch {
    // 红点失败不打断反馈填写
  }
}

function openPanel(): void {
  view.value = 'form'
  open.value = true
  void refreshUnread()
  void nextTick(() => editorRef.value?.focus())
}

function closePanel(): void {
  if (submitting.value) return
  open.value = false
  view.value = 'form'
}

async function insertImages(files: File[]): Promise<void> {
  const editor = editorRef.value
  if (!editor || uploading.value || files.length === 0) return
  const range = captureRange()
  uploading.value = true
  try {
    for (const file of files) {
      const reason = feedbackImageRejection(file, readFeedbackEditor(editor).imageCount)
      if (reason) {
        toast({ title: reason })
        break
      }
      const token = await uploadFeedbackImage(file)
      const url = URL.createObjectURL(file)
      localObjectUrls.push(url)
      const image = document.createElement('img')
      image.src = url
      image.alt = ''
      image.dataset.f8s = token
      placeNode(image, range)
      syncEditor()
    }
  } catch (error) {
    toast({
      title: error instanceof Error ? error.message : '图片上传失败，请重试',
      variant: 'destructive'
    })
  } finally {
    uploading.value = false
    editor.focus()
  }
}

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromItems = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (fromItems.length > 0) return fromItems
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const images = imageFilesFrom(event.clipboardData)
  if (images.length > 0) {
    void insertImages(images)
    return
  }
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const clipped = clipFeedbackText(text, editorState.value.textLength)
  if (!clipped.trim() && editorState.value.textLength >= FEEDBACK_TEXT_LIMIT) {
    toast({ title: '内容最多 5000 字' })
    return
  }
  if (clipped.length < text.length) toast({ title: '内容最多 5000 字' })
  insertTextNode(clipped)
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  const images = imageFilesFrom(event.dataTransfer)
  if (images.length > 0) void insertImages(images)
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  insertTextNode('\n')
}

function recordImage(record: UserFeedbackRecord): string {
  const token = previewFeedbackComment(record.comment ?? '').fileToken
  return token ? (imageUrls.value[token] ?? '') : ''
}

function onBeforeInput(event: Event): void {
  if (!(event instanceof InputEvent)) return
  if (event.isComposing || event.inputType === 'insertFromPaste') return
  if (!event.inputType.startsWith('insert')) return
  const incoming = event.data?.replace(/[\n\r]/g, '').length ?? 0
  if (incoming > 0 && editorState.value.textLength + incoming > FEEDBACK_TEXT_LIMIT) {
    event.preventDefault()
    toast({ title: '内容最多 5000 字' })
  }
}

function onCompositionEnd(): void {
  const editor = editorRef.value
  if (!editor) return
  if (readFeedbackEditor(editor).textLength <= FEEDBACK_TEXT_LIMIT) {
    syncEditor()
    return
  }
  editor.innerHTML = lastHtml
  toast({ title: '内容最多 5000 字' })
  syncEditor()
}

async function submit(): Promise<void> {
  const editor = editorRef.value
  if (!editor || !canSubmit.value) return
  const state = readFeedbackEditor(editor)
  if (state.imageCount > FEEDBACK_IMAGE_LIMIT) {
    toast({ title: '最多只能上传 10 张图片' })
    return
  }
  submitting.value = true
  try {
    await submitUserFeedback({
      comment: buildFeedbackComment(state.parts),
      rating: rating.value
    })
    toast({ title: '感谢您的反馈' })
    resetForm()
    open.value = false
    void refreshUnread()
  } catch (error) {
    toast({
      title: error instanceof Error ? error.message : '提交反馈失败',
      variant: 'destructive'
    })
  } finally {
    submitting.value = false
  }
}

async function openRecords(): Promise<void> {
  view.value = 'records'
  recordsLoading.value = true
  recordsError.value = ''
  try {
    const userName = readStoredUserInfo().userName?.trim()
    if (!userName) {
      records.value = []
      recordsError.value = '请先登录后再查看反馈记录'
      return
    }
    const list = await fetchFeedbackList(userName)
    records.value = list
    await Promise.all(
      list.map(async (item) => {
        const token = previewFeedbackComment(item.comment ?? '').fileToken
        if (!token || imageUrls.value[token]) return
        const url = await loadFeedbackImageObjectUrl(token)
        if (url) imageUrls.value = { ...imageUrls.value, [token]: url }
      })
    )
  } catch (error) {
    records.value = []
    recordsError.value = error instanceof Error ? error.message : '查询反馈记录失败'
  } finally {
    recordsLoading.value = false
  }
}

function backToForm(): void {
  view.value = 'form'
  void refreshUnread()
  void nextTick(() => editorRef.value?.focus())
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  closePanel()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  void refreshUnread()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  revokeLocalUrls()
})
</script>

<template>
  <button type="button" class="open-platform-page__feedback" @click="openPanel">
    用户反馈
    <i v-if="hasUnread" class="open-platform-page__feedback-dot" aria-label="有未读回复" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="feedback-mask" @click.self="closePanel">
      <aside
        class="feedback-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-platform-feedback-title"
      >
        <header class="feedback-panel__header">
          <h2 id="open-platform-feedback-title">反馈</h2>
          <button type="button" class="feedback-panel__close" aria-label="关闭" @click="closePanel">
            <Icon icon="lucide:x" />
          </button>
        </header>

        <div v-if="view === 'form'" class="feedback-panel__body">
          <div class="feedback-panel__hero">
            <img :src="appraiseLogo" alt="" />
            <p>非常重视您的体验，如有需求、建议或问题欢迎反馈，我们将全力解决。</p>
          </div>

          <div class="feedback-panel__card">
            <h3>满意度评分</h3>
            <div class="feedback-panel__stars" @mouseleave="hoverRating = 0">
              <button
                v-for="(label, index) in FEEDBACK_RATING_LABELS"
                :key="label"
                type="button"
                :aria-label="label"
                :aria-pressed="rating === index + 1"
                @mouseenter="hoverRating = index + 1"
                @click="rating = index + 1"
              >
                <svg
                  viewBox="0 0 24 24"
                  :class="{ 'is-on': activeRating >= index + 1 }"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2.6l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.8 6.6 19.4l1-6.1L3.2 9l6.1-.9L12 2.6z"
                  />
                </svg>
                <span>{{ label }}</span>
              </button>
            </div>

            <h3>内容描述</h3>
            <div class="feedback-panel__editor-wrap">
              <div
                ref="editorRef"
                class="feedback-panel__editor"
                :class="{
                  'is-empty': editorState.textLength === 0 && editorState.imageCount === 0
                }"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                aria-label="内容描述"
                data-placeholder="请输入内容描述，也可以直接粘贴图片"
                spellcheck="false"
                @paste="onPaste"
                @dragover.prevent
                @drop="onDrop"
                @keydown="onEditorKeydown"
                @beforeinput="onBeforeInput"
                @input="syncEditor"
                @compositionend="onCompositionEnd"
              />
              <span class="feedback-panel__count"
                >{{ editorState.textLength }}/{{ FEEDBACK_TEXT_LIMIT }}</span
              >
            </div>
            <p v-if="uploading" class="feedback-panel__uploading">图片上传中…</p>

            <button
              type="button"
              class="feedback-panel__submit"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ submitting ? '提交中…' : '提交' }}
            </button>
          </div>

          <button type="button" class="feedback-panel__records" @click="openRecords">
            <Icon icon="lucide:clipboard-list" />
            <span>反馈记录</span>
            <i v-if="hasUnread" class="feedback-panel__dot" />
          </button>
        </div>

        <div v-else class="feedback-panel__body">
          <button type="button" class="feedback-panel__back" @click="backToForm">
            <Icon icon="lucide:chevron-left" />
            返回
          </button>
          <p v-if="recordsLoading" class="feedback-panel__status">加载中…</p>
          <p v-else-if="recordsError" class="feedback-panel__status">{{ recordsError }}</p>
          <p v-else-if="records.length === 0" class="feedback-panel__status">暂无数据</p>
          <div v-else class="feedback-panel__list">
            <article
              v-for="(item, index) in records"
              :key="`${item.id ?? 'feedback'}-${index}`"
              class="feedback-panel__record"
            >
              <div class="feedback-panel__record-head">
                <div v-if="item.rating" class="feedback-panel__mini-stars" aria-hidden="true">
                  <svg
                    v-for="star in 5"
                    :key="star"
                    viewBox="0 0 24 24"
                    :class="{ 'is-on': star <= Number(item.rating) }"
                  >
                    <path
                      d="M12 2.6l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.8 6.6 19.4l1-6.1L3.2 9l6.1-.9L12 2.6z"
                    />
                  </svg>
                </div>
                <span v-else>未评分</span>
                <i v-if="isItemUnread(item.isRead)" class="feedback-panel__dot" />
              </div>
              <p class="feedback-panel__record-text">
                <img v-if="recordImage(item)" :src="recordImage(item)" alt="" />
                <span>{{ recordPreview(item).text }}</span>
              </p>
              <time>{{ item.createDate || '' }}</time>
            </article>
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style lang="less" scoped>
.feedback-mask {
  position: fixed;
  z-index: 1200;
  inset: 0;
  background: rgba(30, 42, 90, 0.28);
}

.feedback-panel {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  width: min(420px, 100vw);
  height: 100%;
  background: #fff;
  box-shadow: -8px 0 32px rgba(30, 42, 90, 0.12);
  color: #1e2a5a;

  &__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 16px 0 20px;
    border-bottom: 1px solid #e5e9f5;

    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
  }

  &__close,
  &__back,
  &__records {
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    color: #4a5578;
    font: inherit;
    cursor: pointer;
  }

  &__close {
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 18px;

    &:hover {
      background: rgba(59, 110, 240, 0.08);
      color: #3a6cea;
    }
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 8px 20px 20px;
    overflow: auto;
  }

  &__hero {
    position: relative;
    flex: 0 0 auto;

    img {
      display: block;
      width: 100%;
      height: auto;
    }

    p {
      position: absolute;
      top: 32%;
      left: 6%;
      width: 62%;
      margin: 0;
      color: #1d2129;
      font-size: 13px;
      line-height: 1.45;
    }
  }

  &__card {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    margin-top: 4px;
    padding: 20px 16px 16px;
    border-radius: 16px;
    background: #f4f6fb;

    h3 {
      flex: 0 0 auto;
      margin: 0 0 16px;
      font-size: 14px;
      font-weight: 600;
    }
  }

  &__stars {
    display: flex;
    flex: 0 0 auto;
    justify-content: center;
    gap: 2px;
    margin-bottom: 28px;

    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 58px;
      border: 0;
      background: transparent;
      color: #86909c;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    svg {
      width: 36px;
      height: 36px;
      fill: none;
      stroke: #c9cdd4;
      stroke-width: 1.5;
      stroke-linejoin: round;

      &.is-on {
        fill: #f7ba1e;
        stroke: #f7ba1e;
      }
    }
  }

  &__editor-wrap {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }

  &__editor {
    position: relative;
    flex: 1 1 auto;
    /* 只保底一行可输入高度，多出来的面板高度由这块吃掉 */
    min-height: 96px;
    padding: 12px 12px 28px;
    overflow: auto;
    border: 1px solid #e5e9f5;
    border-radius: 12px;
    background: #fff;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 14px;
    line-height: 1.6;

    &:focus {
      border-color: #3a6cea;
    }

    &.is-empty::before {
      content: attr(data-placeholder);
      position: absolute;
      top: 12px;
      right: 12px;
      left: 12px;
      color: #c9cdd4;
      pointer-events: none;
    }

    :deep(img) {
      display: block;
      max-width: 100%;
      margin: 8px 0;
      border-radius: 8px;
    }
  }

  &__count {
    position: absolute;
    right: 12px;
    bottom: 8px;
    color: #86909c;
    font-size: 12px;
  }

  &__uploading {
    margin: 8px 0 0;
    color: #3a6cea;
    font-size: 12px;
  }

  &__submit {
    flex: 0 0 auto;
    height: 40px;
    margin-top: 20px;
    border: 0;
    border-radius: 20px;
    background: linear-gradient(180deg, #79acff 0%, #3a6cea 100%);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: linear-gradient(180deg, #6ea2ff 0%, #2f62d6 100%);
    }

    &:disabled {
      background: #c5d8ff;
      cursor: not-allowed;
    }
  }

  &__records {
    flex: 0 0 auto;
    align-self: flex-end;
    gap: 6px;
    margin-top: 16px;
    font-size: 14px;
    font-weight: 600;

    &:hover {
      color: #3a6cea;
    }
  }

  &__dot {
    display: inline-block;
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f53f3f;
  }

  &__back {
    gap: 2px;
    align-self: flex-start;
    margin-bottom: 16px;
    font-size: 14px;

    &:hover {
      color: #3a6cea;
    }
  }

  &__status {
    margin: 48px 0;
    color: #86909c;
    text-align: center;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__record {
    padding: 16px;
    border-radius: 12px;
    background: #f4f6fb;

    time {
      display: block;
      margin-top: 8px;
      color: #86909c;
      font-size: 13px;
      text-align: right;
    }
  }

  &__record-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #4a5578;
    font-size: 13px;
  }

  &__mini-stars {
    display: flex;
    gap: 2px;

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: #c9cdd4;
      stroke-width: 1.6;

      &.is-on {
        fill: #f7ba1e;
        stroke: #f7ba1e;
      }
    }
  }

  &__record-text {
    display: -webkit-box;
    margin: 8px 0 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: #1e2a5a;
    font-size: 14px;
    line-height: 1.5;

    img {
      height: 18px;
      margin-right: 4px;
      vertical-align: middle;
      border-radius: 2px;
      object-fit: cover;
    }
  }
}
</style>
