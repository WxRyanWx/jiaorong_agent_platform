<!-- 知识库选择器：个人 / 共享列表、进入目录多选、确认后回传选中项。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import {
  formatKnowledgeBaseError,
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
  /** 是否打开对话框 */
  open: boolean
  /** 知识库鉴权；缺 token 无法加载 */
  auth: JiaorongChatKnowledgeBaseAuth | null
  /** 已确认的选中项，打开时灌进草稿 */
  selected: JiaorongKbSelection[]
}>()

const emit = defineEmits<{
  /** 同步 v-model:open */
  'update:open': [value: boolean]
  /** 点确认，带回当前草稿 */
  confirm: [items: JiaorongKbSelection[]]
}>()

/** 1 个人知识库，2 共享知识库 */
const kbType = shallowRef<1 | 2>(1)
/** 列表或目录浏览 */
const viewMode = shallowRef<'list' | 'directory'>('list')
/** 知识库列表加载中 */
const listLoading = shallowRef(false)
/** 目录加载中（含加载更多） */
const directoryLoading = shallowRef(false)
/** 列表 / 目录错误文案 */
const errorMessage = shallowRef('')
/** 搜索框即时值 */
const searchInput = shallowRef('')
/** 防抖后实际用于请求的关键字 */
const searchKeyword = shallowRef('')
/** 当前页知识库卡片 */
const kbList = ref<KnowledgeBaseListItem[]>([])
/** 当前目录条目 */
const directoryList = ref<KnowledgeBaseDirectoryItem[]>([])
/** 目录面包屑 */
const breadcrumbs = ref<Array<{ directoryId: string; name: string }>>([])
/** 当前打开的目录 ID */
const currentDirectoryId = shallowRef('')
/** 进入目录时所属的知识库 */
const activeKnowledgeBase = shallowRef<KnowledgeBaseListItem | null>(null)
/** 目录当前页码 */
const directoryPage = shallowRef(1)
/** 目录总条数，用于「加载更多」 */
const directoryTotal = shallowRef(0)
/** 草稿选中，key 为 {@link kbSelectionKey} */
const draftByKey = ref<Record<string, JiaorongKbSelection>>({})
/** 搜索输入防抖定时器。 */
let searchTimer: ReturnType<typeof setTimeout> | null = null
/** 列表请求序号，过期响应丢弃 */
let listLoadSeq = 0
/** 目录请求序号，过期响应丢弃 */
let directoryLoadSeq = 0

/** 草稿选中项列表 */
const draftItems = computed(() => Object.values(draftByKey.value))
/** 当前目录是否全选 */
const allDirectoryChecked = computed(() => {
  // 空目录没有「全选」语义
  if (directoryList.value.length === 0) return false
  return directoryList.value.every((row) => isDraftSelected(directoryRowKey(row)))
})
/** 底部「已选择 x 个…」摘要 */
const selectionSummary = computed(() => {
  /** 已选知识库数量。 */
  let kb = 0
  /** 已选文件夹数量。 */
  let folder = 0
  /** 已选文件数量。 */
  let file = 0
  for (const item of draftItems.value) {
    // 按 kind 分类计数，拼底部摘要
    if (item.kind === 'knowledgeBase') kb += 1
    else if (item.kind === 'folder') folder += 1
    else file += 1
  }
  /** 非零类别拼成的中文片段。 */
  const parts: string[] = []
  if (kb > 0) parts.push(`${kb} 个知识库`) // 有知识库才写进摘要
  if (folder > 0) parts.push(`${folder} 个文件夹`) // 有文件夹才写进摘要
  if (file > 0) parts.push(`${file} 个文件`) // 有文件才写进摘要
  return parts.length ? `已选择 ${parts.join('、')}` : '未选择'
})

/** 草稿里是否已勾选该 key。 */
function isDraftSelected(key: string) {
  return Boolean(draftByKey.value[key])
}

/** 勾选则写入草稿，取消则删掉该 key。 */
function setDraftItem(item: JiaorongKbSelection, checked: boolean) {
  // 勾选：写入草稿
  if (checked) {
    draftByKey.value = { ...draftByKey.value, [item.key]: item }
    return
  }
  /** 去掉该 key 后的草稿副本。 */
  const next = { ...draftByKey.value }
  delete next[item.key]
  draftByKey.value = next
}

/** 清掉搜索防抖定时器。 */
function clearSearchTimer() {
  // 有未触发的防抖才清，避免重复 clearTimeout
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

/** 输入 300ms 后改关键字并重载当前视图。 */
function scheduleSearch() {
  clearSearchTimer()
  searchTimer = setTimeout(() => {
    searchKeyword.value = searchInput.value.trim()
    // 列表视图按关键字重拉知识库
    if (viewMode.value === 'list') void loadList()
    else {
      // 目录搜索从第一页重来
      directoryPage.value = 1
      void loadDirectory(currentDirectoryId.value, false, 1)
    }
  }, 300)
}

/** 拉知识库列表。无 auth 提示缺 token。 */
async function loadList() {
  // 缺 token / apiBaseUrl：提示后清空列表
  if (!props.auth) {
    errorMessage.value = '未传入 token，无法加载知识库'
    kbList.value = []
    return
  }
  /** 本次列表请求序号。 */
  const seq = ++listLoadSeq
  listLoading.value = true
  errorMessage.value = ''
  kbList.value = []
  try {
    /** 当前 tab + 关键字下的知识库卡片。 */
    const list = await queryKnowledgeBases(props.auth, {
      type: kbType.value,
      name: searchKeyword.value
    })
    // 过期请求：用户已再次搜索或切 tab
    if (seq !== listLoadSeq) return
    kbList.value = list
  } catch (error) {
    // 过期错误不覆盖新请求的文案
    if (seq !== listLoadSeq) return
    errorMessage.value = formatKnowledgeBaseError(error)
  } finally {
    // 只有最新请求才能关 loading
    if (seq === listLoadSeq) listLoading.value = false
  }
}

/**
 * 拉目录。`append` 为加载更多；加载中禁止再 append，避免页码乱跳。
 */
async function loadDirectory(directoryId: string, append: boolean, pageOverride?: number) {
  // 缺鉴权无法查目录
  if (!props.auth) return
  /** 去掉空白后的目录 id。 */
  const trimmedId = directoryId.trim()
  // 空 id 无法请求
  if (!trimmedId) return
  // 上一页还在飞：禁止再 append，避免页码乱跳
  if (append && directoryLoading.value) return
  /** 本次目录请求序号。 */
  const seq = ++directoryLoadSeq
  /** 实际请求页码；append 默认当前页 + 1。 */
  const page = pageOverride ?? (append ? directoryPage.value + 1 : directoryPage.value)
  directoryLoading.value = true
  errorMessage.value = ''
  // 非追加：先清空，避免旧页闪一下
  if (!append) {
    directoryList.value = []
    directoryTotal.value = 0
    directoryPage.value = page
  }
  try {
    /** 当前目录一页。 */
    const result = await queryKnowledgeBaseDirectory(props.auth, {
      directoryId: trimmedId,
      page,
      fileName: searchKeyword.value || undefined
    })
    // 过期响应：用户已切目录或重搜
    if (seq !== directoryLoadSeq) return
    directoryTotal.value = result?.total ?? 0
    /** 本页条目。 */
    const rows = result?.list ?? []
    directoryList.value = append ? [...directoryList.value, ...rows] : rows
    // 追加成功后才推进页码
    if (append) directoryPage.value = page
  } catch (error) {
    // 过期错误不覆盖新请求
    if (seq !== directoryLoadSeq) return
    errorMessage.value = formatKnowledgeBaseError(error)
    // 首屏失败才清空，加载更多失败保留已有行
    if (!append) directoryList.value = []
  } finally {
    // 只有最新请求才能关 loading
    if (seq === directoryLoadSeq) directoryLoading.value = false
  }
}

/** 切换个人 / 共享，回到列表并清空搜索与面包屑。 */
function switchType(type: 1 | 2) {
  kbType.value = type
  viewMode.value = 'list'
  searchInput.value = ''
  searchKeyword.value = ''
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  void loadList()
}

/** 勾选或取消整库。 */
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

/** 点卡片进入该库根目录。缺 directoryId 无法打开。 */
async function enterKnowledgeBase(item: KnowledgeBaseListItem) {
  /** 该库根目录 id。 */
  const directoryId = item.directoryId.trim()
  // 接口没给 directoryId：无法打开目录浏览
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

/** 目录行的草稿 key：带上所属知识库，避免跨库同 id。 */
function directoryRowKey(row: KnowledgeBaseDirectoryItem) {
  return kbSelectionKey(row.isDirectory ? 'folder' : 'file', row.id, activeKnowledgeBase.value?.id)
}

/** 当前页全选 / 全不选。 */
function toggleSelectAllDirectory(checked: boolean) {
  for (const row of directoryList.value) setDirectoryRowChecked(row, checked)
}

/** 解析状态样式：成功 / 进行中，其余无修饰。 */
function statusClass(status: string | null): string {
  // 空状态不加点样式
  if (!status) return ''
  // 「成功」用绿色
  if (status.includes('成功')) return 'is-success'
  // 「解析中」等进行态用待处理色
  if (status.includes('中')) return 'is-pending'
  return ''
}

/** 勾选目录里的文件夹或文件。 */
function setDirectoryRowChecked(row: KnowledgeBaseDirectoryItem, checked: boolean) {
  /** 当前打开的知识库，用来填所属库字段。 */
  const kb = activeKnowledgeBase.value
  /** 目录行是文件夹还是文件。 */
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

/** 进入子文件夹；文件行不处理。 */
async function enterFolder(row: KnowledgeBaseDirectoryItem) {
  // 文件行不能进入
  if (!row.isDirectory) return
  breadcrumbs.value = [...breadcrumbs.value, { directoryId: row.id, name: row.fileName }]
  currentDirectoryId.value = row.id
  directoryPage.value = 1
  searchInput.value = ''
  searchKeyword.value = ''
  await loadDirectory(row.id, false, 1)
}

/** 点面包屑回到指定层（含该层）。 */
async function goBreadcrumb(index: number) {
  /** 点中的那层面包屑。 */
  const target = breadcrumbs.value[index]
  // 下标越界：忽略
  if (!target) return
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  currentDirectoryId.value = target.directoryId
  directoryPage.value = 1
  await loadDirectory(target.directoryId, false, 1)
}

/** 从目录回到知识库列表。 */
async function backToList() {
  viewMode.value = 'list'
  breadcrumbs.value = []
  activeKnowledgeBase.value = null
  currentDirectoryId.value = ''
  directoryList.value = []
  await loadList()
}

/** 确认草稿并关对话框。 */
function confirm() {
  emit('confirm', draftItems.value)
  emit('update:open', false)
}

/** 仅关对话框，不改已确认选中。 */
function close() {
  emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    // 关掉后清防抖，避免关窗后还发请求
    if (!open) {
      clearSearchTimer()
      return
    }
    /** 用已确认选中灌进草稿。 */
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
    <!-- 遮罩：点空白处关闭 -->
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
        <!-- 标题 -->
        <div class="kb-picker-header">
          <h2 class="kb-picker-title">从知识库中选择</h2>
          <p class="kb-picker-subtitle">可同时选择知识库、文件夹或单个文档</p>
        </div>

        <div class="kb-picker-body">
          <!-- 知识库列表：个人 / 共享 + 搜索 + 卡片 -->
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

          <!-- 目录浏览：面包屑 + 表格 + 加载更多 -->
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

        <!-- 底部：选中摘要 + 取消 / 确认 -->
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
