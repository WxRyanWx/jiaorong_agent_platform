<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import {
  formatKnowledgeFileSize,
  kbSelectionKey,
  queryKnowledgeBaseDirectory,
  queryKnowledgeBases
} from '../lib/kbApi'
import KbFileTypeIcon from './KbFileTypeIcon.vue'
import KbIcon from './KbIcon.vue'
import type {
  JiaorongChatKnowledgeBaseAuth,
  JiaorongKbSelection,
  KnowledgeBaseDirectoryItem,
  KnowledgeBaseListItem
} from '../types'
import './KnowledgeBasePickerDialog.less'

const props = defineProps<{
  open: boolean
  auth: JiaorongChatKnowledgeBaseAuth | null
  selected: JiaorongKbSelection[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [items: JiaorongKbSelection[]]
}>()

const kbType = shallowRef<1 | 2>(1)
const viewMode = shallowRef<'list' | 'directory'>('list')
const listLoading = shallowRef(false)
const directoryLoading = shallowRef(false)
const errorMessage = shallowRef('')
const searchInput = shallowRef('')
const searchKeyword = shallowRef('')
const kbList = ref<KnowledgeBaseListItem[]>([])
const directoryList = ref<KnowledgeBaseDirectoryItem[]>([])
const breadcrumbs = ref<Array<{ directoryId: string; name: string }>>([])
const currentDirectoryId = shallowRef('')
const activeKnowledgeBase = shallowRef<KnowledgeBaseListItem | null>(null)
const directoryPage = shallowRef(1)
const directoryTotal = shallowRef(0)
const draftByKey = ref<Record<string, JiaorongKbSelection>>({})
let searchTimer: ReturnType<typeof setTimeout> | null = null
let listLoadSeq = 0
let directoryLoadSeq = 0

const draftItems = computed(() => Object.values(draftByKey.value))
const allDirectoryChecked = computed(() => {
  if (directoryList.value.length === 0) return false
  return directoryList.value.every((row) => isDraftSelected(directoryRowKey(row)))
})
const selectionSummary = computed(() => {
  let kb = 0
  let folder = 0
  let file = 0
  for (const item of draftItems.value) {
    if (item.kind === 'knowledgeBase') kb += 1
    else if (item.kind === 'folder') folder += 1
    else file += 1
  }
  const parts: string[] = []
  if (kb > 0) parts.push(`${kb} 个知识库`)
  if (folder > 0) parts.push(`${folder} 个文件夹`)
  if (file > 0) parts.push(`${file} 个文件`)
  return parts.length ? `已选择 ${parts.join('、')}` : '未选择'
})

function isDraftSelected(key: string) {
  return Boolean(draftByKey.value[key])
}

function setDraftItem(item: JiaorongKbSelection, checked: boolean) {
  if (checked) {
    draftByKey.value = { ...draftByKey.value, [item.key]: item }
    return
  }
  const next = { ...draftByKey.value }
  delete next[item.key]
  draftByKey.value = next
}

function clearSearchTimer() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

function scheduleSearch() {
  clearSearchTimer()
  searchTimer = setTimeout(() => {
    searchKeyword.value = searchInput.value.trim()
    if (viewMode.value === 'list') void loadList()
    else {
      directoryPage.value = 1
      void loadDirectory(currentDirectoryId.value, false, 1)
    }
  }, 300)
}

async function loadList() {
  if (!props.auth) {
    errorMessage.value = '未传入 token，无法加载知识库'
    kbList.value = []
    return
  }
  const seq = ++listLoadSeq
  listLoading.value = true
  errorMessage.value = ''
  kbList.value = []
  try {
    const list = await queryKnowledgeBases(props.auth, {
      type: kbType.value,
      name: searchKeyword.value
    })
    if (seq !== listLoadSeq) return
    kbList.value = list
  } catch (error) {
    if (seq !== listLoadSeq) return
    errorMessage.value = error instanceof Error ? error.message : '加载知识库失败'
  } finally {
    if (seq === listLoadSeq) listLoading.value = false
  }
}

async function loadDirectory(directoryId: string, append: boolean, pageOverride?: number) {
  if (!props.auth) return
  const trimmedId = directoryId.trim()
  if (!trimmedId) return
  if (append && directoryLoading.value) return
  const seq = ++directoryLoadSeq
  const page = pageOverride ?? (append ? directoryPage.value + 1 : directoryPage.value)
  directoryLoading.value = true
  errorMessage.value = ''
  if (!append) {
    directoryList.value = []
    directoryTotal.value = 0
    directoryPage.value = page
  }
  try {
    const result = await queryKnowledgeBaseDirectory(props.auth, {
      directoryId: trimmedId,
      page,
      fileName: searchKeyword.value || undefined
    })
    if (seq !== directoryLoadSeq) return
    directoryTotal.value = result?.total ?? 0
    const rows = result?.list ?? []
    directoryList.value = append ? [...directoryList.value, ...rows] : rows
    if (append) directoryPage.value = page
  } catch (error) {
    if (seq !== directoryLoadSeq) return
    errorMessage.value = error instanceof Error ? error.message : '加载目录失败'
    if (!append) directoryList.value = []
  } finally {
    if (seq === directoryLoadSeq) directoryLoading.value = false
  }
}

function switchType(type: 1 | 2) {
  kbType.value = type
  viewMode.value = 'list'
  searchInput.value = ''
  searchKeyword.value = ''
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  void loadList()
}

function setKnowledgeBaseChecked(item: KnowledgeBaseListItem, checked: boolean) {
  setDraftItem(
    {
      key: kbSelectionKey('knowledgeBase', item.id),
      kind: 'knowledgeBase',
      id: item.id,
      name: item.name,
      directoryId: item.directoryId,
      agKbId: item.agKbId,
      knowledgeBaseId: item.id,
      knowledgeBaseName: item.name,
      icon: item.icon
    },
    checked
  )
}

async function enterKnowledgeBase(item: KnowledgeBaseListItem) {
  const directoryId = item.directoryId.trim()
  if (!directoryId) {
    errorMessage.value = '该知识库缺少目录信息，无法打开'
    return
  }
  activeKnowledgeBase.value = item
  viewMode.value = 'directory'
  searchInput.value = ''
  searchKeyword.value = ''
  breadcrumbs.value = [{ directoryId, name: item.name }]
  currentDirectoryId.value = directoryId
  directoryPage.value = 1
  await loadDirectory(directoryId, false, 1)
}

function directoryRowKey(row: KnowledgeBaseDirectoryItem) {
  return kbSelectionKey(row.isDirectory ? 'folder' : 'file', row.id, activeKnowledgeBase.value?.id)
}

function toggleSelectAllDirectory(checked: boolean) {
  for (const row of directoryList.value) setDirectoryRowChecked(row, checked)
}

function statusClass(status: string | null): string {
  if (!status) return ''
  if (status.includes('成功')) return 'is-success'
  if (status.includes('中')) return 'is-pending'
  return ''
}

function setDirectoryRowChecked(row: KnowledgeBaseDirectoryItem, checked: boolean) {
  const kb = activeKnowledgeBase.value
  const kind = row.isDirectory ? 'folder' : 'file'
  setDraftItem(
    {
      key: directoryRowKey(row),
      kind,
      id: row.id,
      name: row.fileName,
      directoryId: kb?.directoryId,
      agKbId: kb?.agKbId,
      knowledgeBaseId: kb?.id,
      knowledgeBaseName: kb?.name,
      fileId: row.fileId,
      knowledgeFileId: row.knowledgeFileId,
      extension: row.extension
    },
    checked
  )
}

async function enterFolder(row: KnowledgeBaseDirectoryItem) {
  if (!row.isDirectory) return
  breadcrumbs.value = [...breadcrumbs.value, { directoryId: row.id, name: row.fileName }]
  currentDirectoryId.value = row.id
  directoryPage.value = 1
  searchInput.value = ''
  searchKeyword.value = ''
  await loadDirectory(row.id, false, 1)
}

async function goBreadcrumb(index: number) {
  const target = breadcrumbs.value[index]
  if (!target) return
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  currentDirectoryId.value = target.directoryId
  directoryPage.value = 1
  await loadDirectory(target.directoryId, false, 1)
}

async function backToList() {
  viewMode.value = 'list'
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  currentDirectoryId.value = ''
  directoryList.value = []
  await loadList()
}

function confirm() {
  emit('confirm', draftItems.value)
  emit('update:open', false)
}

function close() {
  emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      clearSearchTimer()
      return
    }
    const next: Record<string, JiaorongKbSelection> = {}
    for (const item of props.selected) next[item.key] = item
    draftByKey.value = next
    viewMode.value = 'list'
    kbType.value = 1
    searchInput.value = ''
    searchKeyword.value = ''
    breadcrumbs.value = []
    void loadList()
  }
)

onBeforeUnmount(() => {
  clearSearchTimer()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="kb-picker-overlay" @click.self="close">
      <div
        class="kb-picker-dialog relative"
        role="dialog"
        aria-modal="true"
        data-testid="knowledge-base-picker-dialog"
      >
        <button type="button" class="kb-picker-close" aria-label="关闭" @click="close">
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
        <div class="kb-picker-header">
          <h2 class="kb-picker-title">从知识库中选择</h2>
          <p class="kb-picker-subtitle">可同时选择知识库、文件夹或单个文档</p>
        </div>

        <div class="kb-picker-body">
          <template v-if="viewMode === 'list'">
            <div class="kb-picker-list-toolbar">
              <div class="kb-picker-tabs">
                <button
                  type="button"
                  class="kb-picker-tab"
                  :class="{ 'is-active': kbType === 1 }"
                  @click="switchType(1)"
                >
                  个人知识库
                </button>
                <button
                  type="button"
                  class="kb-picker-tab"
                  :class="{ 'is-active': kbType === 2 }"
                  @click="switchType(2)"
                >
                  共享知识库
                </button>
              </div>
              <div class="kb-picker-search kb-picker-list-search">
                <Icon icon="lucide:search" class="kb-picker-search-icon" />
                <input
                  v-model="searchInput"
                  class="kb-picker-search-input"
                  placeholder="输入名称搜索"
                  @input="scheduleSearch"
                />
              </div>
            </div>
            <div v-if="errorMessage" class="kb-picker-error">{{ errorMessage }}</div>
            <div
              v-else-if="listLoading"
              class="kb-picker-loading"
              data-testid="kb-picker-list-loading"
            >
              <Icon icon="lucide:loader-circle" class="kb-picker-loading-spinner" />
              <span>加载中…</span>
            </div>
            <div v-else-if="kbList.length === 0" class="kb-picker-empty">暂无知识库</div>
            <div v-else class="kb-picker-card-scroll">
              <div class="kb-picker-card-grid">
                <button
                  v-for="item in kbList"
                  :key="item.id"
                  type="button"
                  class="kb-picker-card"
                  :class="{
                    'is-selected': isDraftSelected(kbSelectionKey('knowledgeBase', item.id))
                  }"
                  @click="enterKnowledgeBase(item)"
                >
                  <div class="kb-picker-card-top">
                    <div class="kb-picker-card-icon">
                      <KbIcon :icon="item.icon" />
                    </div>
                    <div class="kb-picker-card-main">
                      <div class="kb-picker-card-name">{{ item.name }}</div>
                    </div>
                  </div>
                  <div class="kb-picker-card-desc">{{ item.description || '暂无描述' }}</div>
                  <div class="kb-picker-card-footer">
                    <div class="kb-picker-card-meta">
                      <div class="kb-picker-card-meta-line">
                        创建者：{{ item.creatorName || '-' }}
                      </div>
                      <div class="kb-picker-card-meta-line">
                        创建于：{{ item.createTime || '-' }}
                      </div>
                    </div>
                    <div class="kb-picker-card-check" @click.stop>
                      <input
                        type="checkbox"
                        class="kb-picker-native-check"
                        :checked="isDraftSelected(kbSelectionKey('knowledgeBase', item.id))"
                        @change="
                          setKnowledgeBaseChecked(item, ($event.target as HTMLInputElement).checked)
                        "
                      />
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="kb-picker-dir-toolbar">
              <button type="button" class="kb-picker-back" @click="backToList">
                <Icon icon="lucide:chevron-left" class="kb-picker-back-icon" />
                知识库列表
              </button>
              <div class="kb-picker-breadcrumb">
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.directoryId">
                  <span v-if="index > 0"> / </span>
                  <button
                    type="button"
                    class="kb-picker-breadcrumb-btn"
                    @click="goBreadcrumb(index)"
                  >
                    {{ crumb.name }}
                  </button>
                </template>
              </div>
              <div class="kb-picker-search kb-picker-dir-search">
                <Icon icon="lucide:search" class="kb-picker-search-icon" />
                <input
                  v-model="searchInput"
                  class="kb-picker-search-input"
                  placeholder="输入名称搜索"
                  @input="scheduleSearch"
                />
              </div>
            </div>
            <div v-if="errorMessage" class="kb-picker-error">{{ errorMessage }}</div>
            <div
              v-if="directoryLoading && directoryList.length === 0"
              class="kb-picker-loading"
              data-testid="kb-picker-dir-loading"
            >
              <Icon icon="lucide:loader-circle" class="kb-picker-loading-spinner" />
              <span>加载中…</span>
            </div>
            <div
              v-else-if="!directoryLoading && directoryList.length === 0 && !errorMessage"
              class="kb-picker-empty"
            >
              暂无内容
            </div>
            <div v-else-if="directoryList.length > 0" class="kb-picker-table-wrap">
              <table class="kb-picker-table">
                <thead>
                  <tr>
                    <th class="kb-picker-th kb-picker-th-check">
                      <input
                        type="checkbox"
                        class="kb-picker-native-check"
                        :checked="allDirectoryChecked"
                        @change="
                          toggleSelectAllDirectory(($event.target as HTMLInputElement).checked)
                        "
                      />
                    </th>
                    <th class="kb-picker-th kb-picker-th-name">文件夹 / 文件名称</th>
                    <th class="kb-picker-th kb-picker-th-size">文件大小</th>
                    <th class="kb-picker-th kb-picker-th-ext">文件格式</th>
                    <th class="kb-picker-th kb-picker-th-time">创建时间</th>
                    <th class="kb-picker-th kb-picker-th-status">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in directoryList"
                    :key="row.id"
                    class="kb-picker-row"
                    :class="{ 'is-selected': isDraftSelected(directoryRowKey(row)) }"
                  >
                    <td class="kb-picker-td kb-picker-td-check" @click.stop>
                      <input
                        type="checkbox"
                        class="kb-picker-native-check"
                        :checked="isDraftSelected(directoryRowKey(row))"
                        @change="
                          setDirectoryRowChecked(row, ($event.target as HTMLInputElement).checked)
                        "
                      />
                    </td>
                    <td class="kb-picker-td">
                      <button
                        type="button"
                        class="kb-picker-name-btn"
                        @click="row.isDirectory ? enterFolder(row) : undefined"
                      >
                        <KbFileTypeIcon
                          class="kb-picker-name-icon"
                          :file-name="row.fileName"
                          :extension="row.extension"
                          :is-directory="row.isDirectory"
                        />
                        <span class="kb-picker-name-text" :class="{ 'is-folder': row.isDirectory }">
                          {{ row.fileName }}
                        </span>
                      </button>
                    </td>
                    <td class="kb-picker-td kb-picker-td-size kb-picker-muted">
                      {{ row.isDirectory ? '-' : formatKnowledgeFileSize(row.size) }}
                    </td>
                    <td class="kb-picker-td kb-picker-td-ext kb-picker-muted">
                      {{ row.isDirectory ? '-' : row.extension || '-' }}
                    </td>
                    <td class="kb-picker-td kb-picker-td-time kb-picker-muted">
                      {{ row.createTime || '-' }}
                    </td>
                    <td class="kb-picker-td kb-picker-td-status">
                      <span v-if="!row.isDirectory && row.status" class="kb-picker-status">
                        <span class="kb-picker-status-dot" :class="statusClass(row.status)" />
                        <span class="kb-picker-status-text" :class="statusClass(row.status)">
                          {{ row.status }}
                        </span>
                      </span>
                      <span v-else class="kb-picker-muted">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="directoryList.length < directoryTotal" class="kb-picker-load-more">
              <button
                type="button"
                class="kb-picker-load-more-btn"
                :disabled="directoryLoading"
                @click="loadDirectory(currentDirectoryId, true)"
              >
                {{ directoryLoading ? '加载中…' : '加载更多' }}
              </button>
            </div>
          </template>
        </div>

        <div class="kb-picker-footer">
          <div class="kb-picker-summary">{{ selectionSummary }}</div>
          <div class="kb-picker-actions">
            <button type="button" class="kb-picker-btn-cancel" @click="close">取消</button>
            <button type="button" class="kb-picker-btn-confirm" @click="confirm">确认</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
