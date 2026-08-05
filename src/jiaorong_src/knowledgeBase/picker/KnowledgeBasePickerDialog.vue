<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Checkbox } from '@shadcn/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@shadcn/components/ui/dialog'
import {
  queryKnowledgeBaseDirectory,
  queryKnowledgeBases,
  type KnowledgeBaseDirectoryItem,
  type KnowledgeBaseListItem,
  type KnowledgeBaseType
} from '../../api/knowledgeBase'
import { formatKnowledgeFileSize } from './formatFileSize'
import KbFileTypeIcon from './KbFileTypeIcon.vue'
import KbIcon from './KbIcon.vue'
import { knowledgeBaseSelectionKey, type KnowledgeBaseSelectionItem } from './types'
import { useKnowledgeBaseSelection } from './useKnowledgeBaseSelection'
import './KnowledgeBasePickerDialog.less'

type Breadcrumb = {
  directoryId: string
  name: string
}

const props = defineProps<{
  open: boolean
  sessionId?: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const selectionStore = useKnowledgeBaseSelection(() => props.sessionId)

const kbType = ref<KnowledgeBaseType>(1)
const viewMode = ref<'list' | 'directory'>('list')
const listLoading = ref(false)
const directoryLoading = ref(false)
const errorMessage = ref('')
const searchInput = ref('')
const searchKeyword = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const kbList = ref<KnowledgeBaseListItem[]>([])
const directoryList = ref<KnowledgeBaseDirectoryItem[]>([])
const breadcrumbs = ref<Breadcrumb[]>([])
const currentDirectoryId = ref('')
const activeKnowledgeBase = ref<KnowledgeBaseListItem | null>(null)
const directoryPage = ref(1)
const directoryTotal = ref(0)
const directoryPageSize = 20
/** 列表/目录各自序号：丢弃过期响应，且互不共享 loading */
let listLoadSeq = 0
let directoryLoadSeq = 0

function invalidateListLoads() {
  listLoadSeq += 1
  listLoading.value = false
}

function invalidateDirectoryLoads() {
  directoryLoadSeq += 1
  directoryLoading.value = false
}

/** 用普通对象保证模板勾选/高亮可靠刷新（避免 Map.has 追踪问题） */
const draftByKey = ref<Record<string, KnowledgeBaseSelectionItem>>({})

const draftItems = computed(() => Object.values(draftByKey.value))

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
  if (parts.length === 0) return '未选择'
  return `已选择 ${parts.join('、')}`
})

const allDirectoryChecked = computed(() => {
  if (directoryList.value.length === 0) return false
  return directoryList.value.every((row) => isDraftSelected(directoryRowKey(row)))
})

function isDraftSelected(key: string): boolean {
  return Boolean(draftByKey.value[key])
}

function directoryRowKey(row: KnowledgeBaseDirectoryItem): string {
  return knowledgeBaseSelectionKey(
    row.isDirectory ? 'folder' : 'file',
    row.id,
    activeKnowledgeBase.value?.id
  )
}

function setDraftItem(item: KnowledgeBaseSelectionItem, checked: boolean) {
  if (checked) {
    draftByKey.value = {
      ...draftByKey.value,
      [item.key]: item
    }
    return
  }
  const next = { ...draftByKey.value }
  delete next[item.key]
  draftByKey.value = next
}

function syncDraftFromStore() {
  const next: Record<string, KnowledgeBaseSelectionItem> = {}
  for (const item of selectionStore.items.value) {
    next[item.key] = { ...item }
  }
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
    if (viewMode.value === 'list') {
      void loadKnowledgeBaseList()
    } else {
      directoryPage.value = 1
      void loadDirectory(currentDirectoryId.value, false, 1)
    }
  }, 300)
}

async function loadKnowledgeBaseList() {
  const seq = ++listLoadSeq
  listLoading.value = true
  errorMessage.value = ''
  // 先清空，避免切换 tab/搜索时闪旧列表
  kbList.value = []
  try {
    const list = await queryKnowledgeBases({
      page: 1,
      size: 200,
      type: kbType.value,
      name: searchKeyword.value
    })
    if (seq !== listLoadSeq) return
    kbList.value = list
  } catch (error) {
    if (seq !== listLoadSeq) return
    errorMessage.value = error instanceof Error ? error.message : '加载知识库失败'
    kbList.value = []
  } finally {
    if (seq === listLoadSeq) listLoading.value = false
  }
}

async function loadDirectory(directoryId: string, append: boolean, pageOverride?: number) {
  const trimmedId = directoryId?.trim()
  if (!trimmedId) {
    if (!append) {
      errorMessage.value = '目录信息无效，无法打开'
      directoryList.value = []
      directoryTotal.value = 0
      directoryLoading.value = false
    }
    return
  }
  // 追加加载进行中禁止并发，避免连点「加载更多」跳页
  if (append && directoryLoading.value) return

  const seq = ++directoryLoadSeq
  const page = pageOverride ?? (append ? directoryPage.value + 1 : directoryPage.value)
  directoryLoading.value = true
  errorMessage.value = ''
  // 非追加加载先清空，避免进入新目录时闪上一层内容
  if (!append) {
    directoryList.value = []
    directoryTotal.value = 0
    directoryPage.value = page
  }
  try {
    const result = await queryKnowledgeBaseDirectory({
      page,
      size: directoryPageSize,
      directoryId: trimmedId,
      fileName: searchKeyword.value || undefined
    })
    if (seq !== directoryLoadSeq) return
    if (!result) {
      directoryList.value = []
      directoryTotal.value = 0
      return
    }
    directoryTotal.value = result.total
    if (append) {
      directoryPage.value = page
      directoryList.value = [...directoryList.value, ...result.list]
    } else {
      directoryList.value = result.list
    }
  } catch (error) {
    if (seq !== directoryLoadSeq) return
    // 追加失败保留已加载列表，用横幅错误而不是整页替换
    errorMessage.value = error instanceof Error ? error.message : '加载目录失败'
    if (!append) directoryList.value = []
  } finally {
    if (seq === directoryLoadSeq) directoryLoading.value = false
  }
}

function switchType(type: KnowledgeBaseType) {
  if (kbType.value === type && viewMode.value === 'list') return
  clearSearchTimer()
  invalidateDirectoryLoads()
  kbType.value = type
  viewMode.value = 'list'
  searchInput.value = ''
  searchKeyword.value = ''
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  currentDirectoryId.value = ''
  directoryList.value = []
  directoryTotal.value = 0
  void loadKnowledgeBaseList()
}

function setKnowledgeBaseChecked(item: KnowledgeBaseListItem, checked: boolean | 'indeterminate') {
  const key = knowledgeBaseSelectionKey('knowledgeBase', item.id)
  setDraftItem(
    {
      key,
      kind: 'knowledgeBase',
      id: item.id,
      name: item.name,
      directoryId: item.directoryId,
      agKbId: item.agKbId,
      knowledgeBaseId: item.id,
      knowledgeBaseName: item.name,
      icon: item.icon
    },
    checked === true
  )
}

async function enterKnowledgeBase(item: KnowledgeBaseListItem) {
  const directoryId = item.directoryId?.trim()
  if (!directoryId) {
    errorMessage.value = '该知识库缺少目录信息，无法打开'
    return
  }
  clearSearchTimer()
  invalidateListLoads()
  activeKnowledgeBase.value = item
  viewMode.value = 'directory'
  searchInput.value = ''
  searchKeyword.value = ''
  breadcrumbs.value = [{ directoryId, name: item.name }]
  currentDirectoryId.value = directoryId
  directoryPage.value = 1
  await loadDirectory(directoryId, false, 1)
}

function setDirectoryRowChecked(
  row: KnowledgeBaseDirectoryItem,
  checked: boolean | 'indeterminate'
) {
  const kind = row.isDirectory ? 'folder' : 'file'
  const kb = activeKnowledgeBase.value
  const key = knowledgeBaseSelectionKey(kind, row.id, kb?.id)
  setDraftItem(
    {
      key,
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
    checked === true
  )
}

async function enterFolder(row: KnowledgeBaseDirectoryItem) {
  if (!row.isDirectory) return
  const directoryId = row.id?.trim()
  if (!directoryId) {
    errorMessage.value = '目录信息无效，无法打开'
    return
  }
  breadcrumbs.value = [...breadcrumbs.value, { directoryId, name: row.fileName }]
  currentDirectoryId.value = directoryId
  directoryPage.value = 1
  searchInput.value = ''
  searchKeyword.value = ''
  await loadDirectory(directoryId, false, 1)
}

async function goBreadcrumb(index: number) {
  const target = breadcrumbs.value[index]
  if (!target) return
  const directoryId = target.directoryId?.trim()
  if (!directoryId) {
    errorMessage.value = '目录信息无效，无法打开'
    return
  }
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  currentDirectoryId.value = directoryId
  directoryPage.value = 1
  searchInput.value = ''
  searchKeyword.value = ''
  await loadDirectory(directoryId, false, 1)
}

async function backToList() {
  clearSearchTimer()
  invalidateDirectoryLoads()
  viewMode.value = 'list'
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  currentDirectoryId.value = ''
  directoryList.value = []
  directoryTotal.value = 0
  searchInput.value = ''
  searchKeyword.value = ''
  await loadKnowledgeBaseList()
}

function toggleSelectAllDirectory(checked: boolean | 'indeterminate') {
  const shouldSelect = checked === true
  for (const row of directoryList.value) {
    setDirectoryRowChecked(row, shouldSelect)
  }
}

async function loadMoreDirectory() {
  if (directoryLoading.value) return
  if (directoryList.value.length >= directoryTotal.value) return
  await loadDirectory(currentDirectoryId.value, true)
}

function confirmSelection() {
  selectionStore.setItems(draftItems.value)
  isOpen.value = false
}

function cancelSelection() {
  isOpen.value = false
}

function statusClass(status: string | null): string {
  if (!status) return ''
  if (status.includes('成功')) return 'is-success'
  if (status.includes('中')) return 'is-pending'
  return ''
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      clearSearchTimer()
      invalidateListLoads()
      invalidateDirectoryLoads()
      return
    }
    clearSearchTimer()
    invalidateDirectoryLoads()
    syncDraftFromStore()
    viewMode.value = 'list'
    kbType.value = 1
    searchInput.value = ''
    searchKeyword.value = ''
    breadcrumbs.value = []
    activeKnowledgeBase.value = null
    currentDirectoryId.value = ''
    directoryList.value = []
    directoryTotal.value = 0
    void loadKnowledgeBaseList()
  }
)

onBeforeUnmount(() => {
  clearSearchTimer()
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="kb-picker-dialog" data-testid="knowledge-base-picker-dialog">
      <DialogHeader class="kb-picker-header">
        <DialogTitle class="kb-picker-title">从知识库中选择</DialogTitle>
        <DialogDescription class="kb-picker-subtitle">
          可同时选择知识库、文件夹或单个文档
        </DialogDescription>
      </DialogHeader>

      <div class="kb-picker-body">
        <template v-if="viewMode === 'list'">
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

          <div class="kb-picker-search">
            <Icon icon="lucide:search" class="kb-picker-search-icon" />
            <input
              v-model="searchInput"
              class="kb-picker-search-input"
              placeholder="输入名称搜索"
              @input="scheduleSearch"
            />
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
                  'is-selected': isDraftSelected(
                    knowledgeBaseSelectionKey('knowledgeBase', item.id)
                  )
                }"
                @click="enterKnowledgeBase(item)"
              >
                <div class="kb-picker-card-top">
                  <div class="kb-picker-card-icon">
                    <KbIcon :icon="item.icon" />
                  </div>
                  <div class="kb-picker-card-main">
                    <div class="kb-picker-card-name">{{ item.name }}</div>
                    <div class="kb-picker-card-desc">
                      {{ item.description || '暂无描述' }}
                    </div>
                  </div>
                </div>
                <div class="kb-picker-card-footer">
                  <div class="kb-picker-card-meta">
                    <div class="kb-picker-card-meta-line">创建者 {{ item.creatorName || '-' }}</div>
                    <div class="kb-picker-card-meta-line">更新于 {{ item.createTime || '-' }}</div>
                  </div>
                  <div class="kb-picker-card-check" @click.stop>
                    <Checkbox
                      class="kb-picker-checkbox"
                      :class="{
                        'is-checked': isDraftSelected(
                          knowledgeBaseSelectionKey('knowledgeBase', item.id)
                        )
                      }"
                      :checked="
                        isDraftSelected(knowledgeBaseSelectionKey('knowledgeBase', item.id))
                      "
                      @update:checked="setKnowledgeBaseChecked(item, $event)"
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
                <button type="button" class="kb-picker-breadcrumb-btn" @click="goBreadcrumb(index)">
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
                    <Checkbox
                      class="kb-picker-checkbox"
                      :class="{ 'is-checked': allDirectoryChecked }"
                      :checked="allDirectoryChecked"
                      @update:checked="toggleSelectAllDirectory"
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
                    <Checkbox
                      class="kb-picker-checkbox"
                      :class="{ 'is-checked': isDraftSelected(directoryRowKey(row)) }"
                      :checked="isDraftSelected(directoryRowKey(row))"
                      @update:checked="setDirectoryRowChecked(row, $event)"
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
            <Button
              variant="outline"
              size="sm"
              :disabled="directoryLoading"
              @click="loadMoreDirectory"
            >
              {{ directoryLoading ? '加载中…' : '加载更多' }}
            </Button>
          </div>
        </template>
      </div>

      <div class="kb-picker-footer">
        <div class="kb-picker-summary">{{ selectionSummary }}</div>
        <div class="kb-picker-actions">
          <Button variant="outline" class="kb-picker-btn-cancel" @click="cancelSelection">
            取消
          </Button>
          <Button class="kb-picker-btn-confirm" @click="confirmSelection">确认</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
