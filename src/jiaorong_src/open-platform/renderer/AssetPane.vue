<script setup lang="ts">
defineOptions({ name: 'OpenPlatformAssetPane' })

import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button, Select } from '@arco-design/web-vue'
import { Input } from '@shadcn/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@shadcn/components/ui/dialog'
import { useToast } from '@/components/use-toast'
import ConfirmAction from './ConfirmAction.vue'
import type {
  OpenPlatformAssetSummary,
  OpenPlatformClient,
  OpenPlatformConnectorConfig,
  OpenPlatformSkillCategory
} from '@jiaorong/api/openPlatform/types'
import {
  isNewerOpenPlatformVersion,
  isValidOpenPlatformVersion
} from '@jiaorong/api/openPlatform/version'
import { parseConnectorPackage, parseSkillPackage } from '../packages/parseOpenPlatformPackage'
import {
  forgetOpenPlatformPackage,
  readOpenPlatformPackage,
  rememberOpenPlatformPackage
} from './packageCache'
import {
  assetActionFlightVersion,
  buildAssetActionKey,
  isAssetActionInFlight,
  runExclusiveAssetAction
} from './assetActionLock'

const props = defineProps<{
  api: OpenPlatformClient
  assetType: 'skill' | 'connector'
}>()

type ParsedPackage = {
  name: string
  displayName: string
  description: string
  type?: string
  config?: OpenPlatformConnectorConfig
}

/** 弹窗里的只读详情：发布模式取资产摘要，更新模式取本次解析的新包。 */
type PublishDialogDetails = {
  name: string
  id: string
  description: string
  connectorType?: string
  packageName?: string
}

/** 发布 / 更新弹窗状态：表单值只存在这里，不再铺在卡片上。 */
type PublishDialogState = {
  mode: 'publish' | 'update'
  item: OpenPlatformAssetSummary
  parsedPackage: ParsedPackage | null
  packageFile: File | null
  provider: string
  version: string
  categoryId: string
  details: PublishDialogDetails
}

/** 等待用户选包的动作：新建，或发布 / 更新弹窗内补选制品。 */
type PackageRequest = { mode: 'create' } | { mode: 'dialog'; item: OpenPlatformAssetSummary }

const { t } = useI18n()
const { toast } = useToast()
const items = ref<OpenPlatformAssetSummary[]>([])
const packageInput = ref<HTMLInputElement | null>(null)
const packageRequest = ref<PackageRequest | null>(null)
const skillCategories = ref<OpenPlatformSkillCategory[]>([])
const dialog = ref<PublishDialogState | null>(null)
const dialogBody = ref<HTMLDivElement | null>(null)
const dialogError = ref('')
const isConfirmVisible = ref(false)
const confirmContainer = ref<HTMLDivElement | null>(null)
const error = ref('')
/** 列表请求序号：连点重试或多处刷新时，只认最后一次请求的结果。 */
let refreshSequence = 0
const isLoading = ref(false)
const isLocalBusy = ref(false)
/**
 * 动作进行中：本地 busy 之外还要看模块级锁。
 * 面板是 tab 级 `v-if`，切走卸载会把本地 busy 一起丢掉，切回来按钮又变成可点。
 */
const isPublishing = computed(() => {
  void assetActionFlightVersion.value
  if (isLocalBusy.value) return true
  return items.value.some((item) =>
    isAssetActionInFlight(buildAssetActionKey(props.assetType, item.id))
  )
})

const DEV_DOCS_URLS: Record<'skill' | 'connector', string> = {
  skill: 'https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/skills.html',
  connector:
    'https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/connectors.html'
}
const CREATE_LABELS: Record<'skill' | 'connector', string> = {
  skill: '创建技能',
  connector: '创建连接器'
}
const PUBLISH_LABELS: Record<'skill' | 'connector', string> = {
  skill: '发布技能',
  connector: '发布连接器'
}
const MODULE_META: Record<'skill' | 'connector', { title: string; subtitle: string }> = {
  skill: {
    title: '技能',
    subtitle: '将资产封装为可复用的技能，供用户直接调用'
  },
  connector: {
    title: '连接器',
    subtitle: '连接外部数据源或系统，提供数据 / 能力接入'
  }
}
const UPDATE_LABELS: Record<'skill' | 'connector', string> = {
  skill: '更新技能',
  connector: '更新连接器'
}
const ZIP_LABELS: Record<'skill' | 'connector', string> = {
  skill: '技能包',
  connector: '连接器包'
}

const dialogTitle = computed(() =>
  dialog.value?.mode === 'update' ? UPDATE_LABELS[props.assetType] : PUBLISH_LABELS[props.assetType]
)
const categoryOptions = computed(() =>
  skillCategories.value.map((category) => ({
    value: category.id,
    label: category.categoryName
  }))
)
const confirmDescription = computed(() => {
  const state = dialog.value
  if (!state) return ''
  const version = state.version.trim() || '新版本'
  if (state.mode === 'update') {
    return `将使用新 zip 包把「${state.details.name}」更新到 ${version}。`
  }
  return `将使用创建时上传的 zip 包发布「${state.details.name}」的 ${version} 版本。`
})

async function refresh(): Promise<void> {
  const sequence = ++refreshSequence
  isLoading.value = true
  error.value = ''
  try {
    const page =
      props.assetType === 'skill'
        ? await props.api.listSkills('mine')
        : await props.api.listConnectors('mine')
    if (sequence !== refreshSequence) return
    items.value = page.items
  } catch (loadError) {
    if (sequence !== refreshSequence) return
    error.value =
      loadError instanceof Error ? loadError.message : t('routes.openPlatformListFailed')
  } finally {
    if (sequence === refreshSequence) isLoading.value = false
  }
}

/** 技能分类下拉预取；失败不阻塞列表，打开发布弹窗时会重试。 */
async function ensureSkillCategories(): Promise<void> {
  if (props.assetType !== 'skill' || skillCategories.value.length > 0) return
  try {
    skillCategories.value = await props.api.listSkillCategories()
  } catch {
    if (dialog.value) dialogError.value = '技能类型加载失败，请关闭后重新打开发布弹窗'
  }
}

/** 新建草稿：只送清单，制品留到发布时上传；返回后端生成的资产摘要（含真实 id）。 */
async function createDraft(parsedPackage: ParsedPackage): Promise<OpenPlatformAssetSummary> {
  if (props.assetType === 'skill') {
    return props.api.createSkill({
      metadata: {
        name: parsedPackage.name,
        displayName: parsedPackage.displayName,
        description: parsedPackage.description
      }
    })
  }
  return props.api.createConnector({
    metadata: {
      id: parsedPackage.name,
      name: parsedPackage.name,
      description: parsedPackage.description,
      type: (parsedPackage.type ?? 'stdio') as 'stdio' | 'http' | 'sse'
    },
    ...(parsedPackage.config ? { packageConfig: parsedPackage.config } : {})
  })
}

function rememberPackage(id: string, file: File): Promise<boolean> {
  return rememberOpenPlatformPackage(props.assetType, id, file)
}

/**
 * 缓存未落盘时提示：包只在本次运行内有效，重启后发布要重新选 zip。
 * @param cached 是否已写入 IndexedDB
 */
function notifyPackageCacheMiss(cached: boolean): void {
  if (cached) return
  toast({
    title: '安装包未能缓存',
    description: '包较大或浏览器存储不可用，重启客户端后发布需要重新选择 zip'
  })
}

async function choosePackage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  error.value = ''
  if (!file) return
  const request = packageRequest.value
  packageRequest.value = null
  try {
    const parsedPackage = await parsePackage(file)
    if (!request || request.mode === 'create') {
      const created = await createDraft(parsedPackage)
      // 发布弹窗只按列表返回的 id 读缓存，因此也只写这一份，多余 key 发布后清不掉
      const cached = await rememberPackage(created.id, file)
      await refresh()
      toast({ title: '创建成功' })
      notifyPackageCacheMiss(cached)
      return
    }
    if (request.item.id !== parsedPackage.name) throw new Error('包内 ID 与当前内容不一致')
    const cached = await rememberPackage(request.item.id, file)
    notifyPackageCacheMiss(cached)
    // 弹窗补选制品：回填后仍停留在弹窗里，等用户二次确认再提交
    const state = dialog.value
    if (!state || state.item.id !== request.item.id) return
    state.packageFile = file
    state.parsedPackage = parsedPackage
    state.details = {
      name: parsedPackage.displayName || parsedPackage.name,
      id: parsedPackage.name,
      description: parsedPackage.description,
      ...(parsedPackage.type ? { connectorType: parsedPackage.type } : {}),
      packageName: file.name
    }
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : t('routes.openPlatformPackageInvalid')
    if (dialog.value) dialogError.value = message
    else error.value = message
  } finally {
    input.value = ''
  }
}

async function parsePackage(file: File): Promise<ParsedPackage> {
  if (props.assetType === 'skill') return parseSkillPackage(file)
  const metadata = await parseConnectorPackage(file)
  return {
    name: metadata.id,
    displayName: metadata.id,
    description: metadata.description,
    type: metadata.type,
    config: metadata.config
  }
}

function buildItemDetails(
  item: OpenPlatformAssetSummary,
  packageFile: File | null
): PublishDialogDetails {
  return {
    name: item.name,
    id: item.id,
    description: item.description,
    ...(item.connectorType ? { connectorType: item.connectorType } : {}),
    ...(packageFile ? { packageName: packageFile.name } : {})
  }
}

/** 发布弹窗：创建时落盘的 zip 自动带回，缺失（历史草稿 / 缓存被清）才让用户重选。 */
async function openPublishDialog(item: OpenPlatformAssetSummary): Promise<void> {
  if (isPublishing.value) return
  dialogError.value = ''
  isConfirmVisible.value = false
  const packageFile = await readOpenPlatformPackage(props.assetType, item.id)
  if (isPublishing.value) return
  dialog.value = {
    mode: 'publish',
    item,
    parsedPackage: null,
    packageFile,
    provider: item.provider?.trim() ?? '',
    version: item.version?.trim() ?? '',
    categoryId: item.categoryId ?? '',
    details: buildItemDetails(item, packageFile)
  }
  void ensureSkillCategories()
}

function openUpdateDialog(item: OpenPlatformAssetSummary): void {
  if (isPublishing.value) return
  dialogError.value = ''
  isConfirmVisible.value = false
  dialog.value = {
    mode: 'update',
    item,
    parsedPackage: null,
    // 更新必须重新选一份新制品，不复用上次发布时记住的 zip
    packageFile: null,
    provider: item.provider?.trim() ?? '',
    version: item.version?.trim() ?? '',
    categoryId: item.categoryId ?? '',
    details: {
      name: item.name,
      id: item.id,
      description: item.description,
      ...(item.connectorType ? { connectorType: item.connectorType } : {})
    }
  }
  void ensureSkillCategories()
}

function closeDialog(): void {
  if (isPublishing.value) return
  const request = packageRequest.value
  if (request?.mode === 'dialog' && request.item.id === dialog.value?.item.id) {
    packageRequest.value = null
  }
  dialog.value = null
  dialogError.value = ''
  isConfirmVisible.value = false
}

/** 弹窗内补选 zip：发布缺包（刷新后 File 已丢）与更新换包都走这一个文件入口。 */
function pickDialogPackage(): void {
  const state = dialog.value
  if (!state || isPublishing.value) return
  dialogError.value = ''
  packageRequest.value = { mode: 'dialog', item: state.item }
  packageInput.value?.click()
}

/** 弹窗表单前置校验；失败时写 dialogError 并中断。 */
function validateDialog(state: PublishDialogState): boolean {
  if (!state.packageFile) {
    dialogError.value =
      state.mode === 'update'
        ? t('routes.devCenterPublishZipRequired')
        : '创建时上传的安装包已失效，请重新选择 zip 后再发布'
    return false
  }
  if (!state.provider.trim()) {
    dialogError.value = t('routes.openPlatformPublishOrganizationRequired')
    return false
  }
  const version = state.version.trim()
  if (!version) {
    dialogError.value = t('routes.openPlatformPublishVersionRequired')
    return false
  }
  if (!isValidOpenPlatformVersion(version)) {
    dialogError.value = '版本号要用三段式版本号，例如 1.0.0'
    return false
  }
  if (props.assetType === 'skill' && !state.categoryId) {
    dialogError.value = '请选择技能类型'
    return false
  }
  // 只有「更新已发布资产」才要求版本严格递增；草稿首次发布没有前一个版本可比
  if (
    state.mode === 'update' &&
    state.item.version &&
    !isNewerOpenPlatformVersion(version, state.item.version)
  ) {
    dialogError.value = `新版本必须大于 ${state.item.version}`
    return false
  }
  return true
}

/** 二次确认气泡：校验通过才允许弹出，避免用户对着不合法的表单点确认。 */
function handleConfirmVisible(visible: boolean): void {
  if (!visible) {
    isConfirmVisible.value = false
    return
  }
  const state = dialog.value
  if (!state || isPublishing.value) return
  dialogError.value = ''
  if (!validateDialog(state)) return
  isConfirmVisible.value = true
}

async function submitConfirmed(): Promise<void> {
  isConfirmVisible.value = false
  const state = dialog.value
  if (!state || isPublishing.value) return
  if (!validateDialog(state)) return
  await submitPublish(state)
}

/** 真正的发布 / 更新请求体。 */
async function requestPublish(state: PublishDialogState, packageFile: File): Promise<void> {
  const parsedPackage = state.parsedPackage
  if (props.assetType === 'skill') {
    await props.api.publishSkill({
      id: state.item.id,
      provider: state.provider.trim(),
      version: state.version.trim(),
      categoryId: state.categoryId,
      package: packageFile,
      metadata: parsedPackage
        ? {
            name: parsedPackage.name,
            displayName: parsedPackage.displayName,
            description: parsedPackage.description
          }
        : {
            name: state.item.id,
            displayName: state.item.name,
            description: state.item.description
          }
    })
    return
  }
  await props.api.publishConnector({
    id: state.item.id,
    provider: state.provider.trim(),
    version: state.version.trim(),
    package: packageFile,
    metadata: parsedPackage
      ? {
          id: parsedPackage.name,
          name: parsedPackage.name,
          description: parsedPackage.description,
          type: (parsedPackage.type ?? 'stdio') as 'stdio' | 'http' | 'sse'
        }
      : {
          id: state.item.id,
          name: state.item.name,
          description: state.item.description,
          type: state.item.connectorType ?? 'http'
        },
    ...(parsedPackage?.config ? { packageConfig: parsedPackage.config } : {})
  })
}

async function submitPublish(state: PublishDialogState): Promise<void> {
  const packageFile = state.packageFile
  if (!packageFile || isPublishing.value) return
  isLocalBusy.value = true
  dialogError.value = ''
  try {
    await runExclusiveAssetAction(buildAssetActionKey(props.assetType, state.item.id), () =>
      requestPublish(state, packageFile)
    )
    // 发布成功后清掉创建时缓存的 zip：更新走新包、重新上架不传包，这份缓存不会再被读到，
    // 留着就是 IndexedDB 里的死重量（单包上限 200MB）
    await forgetOpenPlatformPackage(props.assetType, state.item.id)
    dialog.value = null
    await refresh()
    toast({ title: state.mode === 'update' ? '更新成功' : '发布成功' })
  } catch (publishError) {
    dialogError.value =
      publishError instanceof Error ? publishError.message : t('routes.openPlatformPublishFailed')
  } finally {
    isLocalBusy.value = false
  }
}

async function unpublish(item: OpenPlatformAssetSummary): Promise<void> {
  if (item.status !== 'published' || isPublishing.value) return
  isLocalBusy.value = true
  error.value = ''
  try {
    await runExclusiveAssetAction(buildAssetActionKey(props.assetType, item.id), () => {
      if (props.assetType === 'skill') return props.api.unpublishSkill(item.id)
      return props.api.unpublishConnector(item.id)
    })
    await refresh()
    toast({ title: '下架成功' })
  } catch (unpublishError) {
    error.value =
      unpublishError instanceof Error
        ? unpublishError.message
        : t('routes.openPlatformUnpublishFailed')
  } finally {
    isLocalBusy.value = false
  }
}

async function remove(item: OpenPlatformAssetSummary): Promise<void> {
  if ((item.status !== 'draft' && item.status !== 'unpublished') || isPublishing.value) return
  isLocalBusy.value = true
  error.value = ''
  try {
    await runExclusiveAssetAction(buildAssetActionKey(props.assetType, item.id), () => {
      if (props.assetType === 'skill') return props.api.removeSkill(item.id)
      return props.api.removeConnector(item.id)
    })
    await forgetOpenPlatformPackage(props.assetType, item.id)
    await refresh()
  } catch (removeError) {
    error.value = removeError instanceof Error ? removeError.message : '移除失败，请稍后重试'
  } finally {
    isLocalBusy.value = false
  }
}

async function republish(item: OpenPlatformAssetSummary): Promise<void> {
  if (item.status !== 'unpublished' || isPublishing.value) return
  isLocalBusy.value = true
  error.value = ''
  try {
    // 重新上架只恢复可见性：沿用原制品与原版本号，不需要再传一次 zip
    await runExclusiveAssetAction(buildAssetActionKey(props.assetType, item.id), () => {
      if (props.assetType === 'skill') return props.api.republishSkill(item.id)
      return props.api.republishConnector(item.id)
    })
    await refresh()
    toast({ title: '重新发布成功' })
  } catch (publishError) {
    error.value =
      publishError instanceof Error ? publishError.message : t('routes.openPlatformPublishFailed')
  } finally {
    isLocalBusy.value = false
  }
}

function startCreate(): void {
  if (isPublishing.value) return
  packageRequest.value = { mode: 'create' }
  error.value = ''
  packageInput.value?.click()
}

/** 重新上架沿用原版本号，发布组织以后端返回的资产数据为准。 */
function isRelistReady(item: OpenPlatformAssetSummary): boolean {
  return Boolean(item.provider?.trim())
}

onMounted(() => {
  void refresh()
  void ensureSkillCategories()
})

function openDocs(): void {
  window.open(DEV_DOCS_URLS[props.assetType], '_blank', 'noopener')
}
</script>

<template>
  <section class="open-platform-pane">
    <header class="open-platform-pane__head">
      <div>
        <h2>{{ MODULE_META[assetType].title }}</h2>
        <p>
          {{ MODULE_META[assetType].subtitle }}
          <button type="button" class="open-platform-pane__intro-link" @click="openDocs">
            了解更多
          </button>
        </p>
      </div>
      <div class="open-platform-pane__actions">
        <input
          ref="packageInput"
          type="file"
          accept=".zip"
          class="open-platform-pane__file-input"
          :data-testid="`open-platform-${assetType}-file`"
          @change="choosePackage"
        />
        <Button
          type="primary"
          size="small"
          :data-testid="`open-platform-create-${assetType}`"
          @click="startCreate"
        >
          <Icon :icon="assetType === 'skill' ? 'lucide:sparkles' : 'lucide:plug'" />
          {{ CREATE_LABELS[assetType] }}
        </Button>
      </div>
    </header>

    <div class="open-platform-pane__body">
      <p v-if="error" class="open-platform-pane__error">{{ error }}</p>
      <div v-if="items.length === 0 && error" class="open-platform-pane__list-error">
        <Button type="outline" size="small" @click="refresh">
          {{ t('routes.openPlatformRetry') }}
        </Button>
      </div>
      <p v-if="isLoading" class="open-platform-pane__empty">
        {{ t('routes.openPlatformLoading') }}
      </p>

      <div v-else-if="items.length === 0" class="open-platform-pane__empty">
        {{ t('routes.openPlatformEmpty') }}
      </div>

      <div v-else class="open-platform-pane__grid">
        <article v-for="item in items" :key="item.id" class="open-platform-pane__card">
          <div class="open-platform-pane__card-head">
            <div class="open-platform-pane__icon">
              <Icon :icon="assetType === 'skill' ? 'lucide:sparkles' : 'lucide:plug'" />
            </div>
            <div>
              <div class="open-platform-pane__name">{{ item.name }}</div>
              <div class="open-platform-pane__meta">
                <span>{{ item.id }}</span>
                <span v-if="item.version">v{{ item.version }}</span>
              </div>
            </div>
          </div>
          <p class="open-platform-pane__desc">{{ item.description }}</p>
          <footer>
            <span class="open-platform-pane__status" :class="`is-${item.status}`">
              {{
                item.status === 'published'
                  ? t('routes.openPlatformStatusPublished')
                  : item.status === 'unpublished'
                    ? t('routes.openPlatformStatusUnpublished')
                    : '未发布'
              }}
            </span>
            <div class="open-platform-pane__card-actions">
              <Button
                v-if="item.status === 'published'"
                type="primary"
                size="small"
                :disabled="isPublishing"
                :data-testid="`open-platform-${assetType}-update-${item.id}`"
                @click="openUpdateDialog(item)"
              >
                {{ UPDATE_LABELS[assetType] }}
              </Button>
              <ConfirmAction
                v-if="item.status === 'published'"
                label="下架"
                description="下架后市场将不再展示该内容。"
                confirm-label="确认下架"
                variant="default"
                confirm-variant="destructive"
                :disabled="isPublishing"
                :test-id="`open-platform-${assetType}-unpublish-${item.id}`"
                @confirm="unpublish(item)"
              />
              <Button
                v-if="item.status === 'draft'"
                type="primary"
                size="small"
                :disabled="isPublishing"
                :data-testid="`open-platform-${assetType}-publish-${item.id}`"
                @click="openPublishDialog(item)"
              >
                发布
              </Button>
              <ConfirmAction
                v-if="item.status === 'unpublished'"
                label="重新发布"
                description="重新发布后市场将恢复展示该内容，可沿用当前版本号。"
                confirm-label="确认发布"
                variant="default"
                :disabled="isPublishing || !isRelistReady(item)"
                :test-id="`open-platform-${assetType}-republish-${item.id}`"
                @confirm="republish(item)"
              />
              <ConfirmAction
                v-if="item.status === 'draft' || item.status === 'unpublished'"
                label="移除"
                description="移除后当前列表将不再展示该内容。"
                confirm-label="确认移除"
                variant="outline"
                confirm-variant="destructive"
                :disabled="isPublishing"
                :test-id="`open-platform-${assetType}-remove-${item.id}`"
                @confirm="remove(item)"
              />
            </div>
          </footer>
        </article>
      </div>
    </div>

    <Dialog :open="dialog !== null" @update:open="(value) => !value && closeDialog()">
      <DialogContent class="open-platform-pane__dialog">
        <div v-if="dialog" ref="dialogBody" class="open-platform-pane__dialog-body">
          <DialogHeader>
            <DialogTitle>{{ dialogTitle }}</DialogTitle>
            <DialogDescription>详情内容不可修改，请核对后填写发布信息。</DialogDescription>
          </DialogHeader>
          <div class="open-platform-pane__form">
            <div class="open-platform-pane__detail-list">
              <div class="open-platform-pane__detail-row">
                <span>名称</span>
                <span>{{ dialog.details.name }}</span>
              </div>
              <div class="open-platform-pane__detail-row">
                <span>ID</span>
                <span>{{ dialog.details.id }}</span>
              </div>
              <div class="open-platform-pane__detail-row">
                <span>简介</span>
                <span>{{ dialog.details.description || '—' }}</span>
              </div>
              <div v-if="dialog.details.connectorType" class="open-platform-pane__detail-row">
                <span>类型</span>
                <span>{{ dialog.details.connectorType }}</span>
              </div>
              <div
                v-if="dialog.mode === 'publish' && dialog.packageFile"
                class="open-platform-pane__detail-row"
              >
                <span>安装包</span>
                <span>{{ dialog.details.packageName || '创建时上传的 zip' }}</span>
              </div>
            </div>
            <div
              v-if="dialog.mode === 'update' || !dialog.packageFile"
              class="open-platform-pane__field"
            >
              <span class="open-platform-pane__required-label">
                <span class="open-platform-pane__required-star">*</span>
                {{ ZIP_LABELS[assetType] }}：
              </span>
              <div class="open-platform-pane__zip-row">
                <Input
                  :model-value="dialog.details.packageName ?? ''"
                  readonly
                  :placeholder="t('routes.devCenterPublishZipPlaceholder')"
                />
                <Button
                  type="outline"
                  size="small"
                  :disabled="isPublishing"
                  :data-testid="`open-platform-${assetType}-zip-${dialog.item.id}`"
                  @click="pickDialogPackage"
                >
                  {{ t('routes.devCenterPublishZipPick') }}
                </Button>
              </div>
            </div>
            <label class="open-platform-pane__field">
              <span class="open-platform-pane__required-label">
                <span class="open-platform-pane__required-star">*</span>
                {{ t('routes.openPlatformPublishVersion') }}：
              </span>
              <Input
                v-model="dialog.version"
                :disabled="isPublishing"
                :data-testid="`open-platform-${assetType}-version-${dialog.item.id}`"
                :placeholder="t('routes.openPlatformPublishVersionPlaceholder')"
              />
            </label>
            <label class="open-platform-pane__field">
              <span class="open-platform-pane__required-label">
                <span class="open-platform-pane__required-star">*</span>
                {{ t('routes.openPlatformPublishOrganization') }}：
              </span>
              <Input
                v-model="dialog.provider"
                :disabled="isPublishing"
                :data-testid="`open-platform-${assetType}-provider-${dialog.item.id}`"
                :placeholder="t('routes.openPlatformPublishOrganizationPlaceholder')"
              />
            </label>
            <div v-if="assetType === 'skill'" class="open-platform-pane__field">
              <span class="open-platform-pane__required-label">
                <span class="open-platform-pane__required-star">*</span>
                技能类型：
              </span>
              <Select
                v-model="dialog.categoryId"
                class="open-platform-pane__select"
                :options="categoryOptions"
                :popup-container="dialogBody ?? undefined"
                :disabled="isPublishing"
                :data-testid="`open-platform-${assetType}-category-${dialog.item.id}`"
                placeholder="请选择技能类型"
              />
            </div>
            <p v-if="dialogError" class="open-platform-pane__error">{{ dialogError }}</p>
          </div>
          <DialogFooter>
            <div ref="confirmContainer" class="open-platform-pane__dialog-footer">
              <Button type="outline" size="small" :disabled="isPublishing" @click="closeDialog">
                {{ t('routes.devCenterCancel') }}
              </Button>
              <ConfirmAction
                :label="dialog.mode === 'update' ? '确认更新' : '确认发布'"
                :description="confirmDescription"
                :confirm-label="dialog.mode === 'update' ? '确认更新' : '确认发布'"
                variant="default"
                :disabled="isPublishing"
                :popup-visible="isConfirmVisible"
                :popup-container="confirmContainer ?? undefined"
                :test-id="`open-platform-${assetType}-confirm-${dialog.item.id}`"
                @update:popup-visible="handleConfirmVisible"
                @confirm="submitConfirmed"
              />
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>
