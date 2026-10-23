<script setup lang="ts">
defineOptions({ name: 'OpenPlatformAppsPane' })

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@arco-design/web-vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@shadcn/components/ui/dialog'
import { Input } from '@shadcn/components/ui/input'
import { Textarea } from '@shadcn/components/ui/textarea'
import { useToast } from '@/components/use-toast'
import { useProjectStore } from '@/stores/ui/project'
import {
  emptyManifestForm,
  inspectManifestRecord,
  type AppManifestFormFields
} from '../../appHost/manifestRules'
import type { OpenPlatformAppAuth, OpenPlatformClient } from '../types'
import type { OpenPlatformAppCapabilities } from './clientAppCapabilities'
import ConfirmAction from './ConfirmAction.vue'
import { useOpenPlatformApps, type OpenPlatformAppCard } from './useOpenPlatformApps'

type PublishField = {
  key: keyof AppManifestFormFields
  required: boolean
  kind: 'input' | 'textarea'
  placeholder?: string
}

type PendingPublishRequest = {
  target: OpenPlatformAppCard
  fields: AppManifestFormFields
  auth: OpenPlatformAppAuth | null
  provider: string
  zipPath: string
}

const DEV_DOCS_URL =
  'https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/jiaorong-app.html'
const MODULE_META = {
  title: '交融智能体应用',
  subtitle: '可独立分发的应用，面向终端用户场景'
}

const props = defineProps<{
  api: OpenPlatformClient
  capabilities: OpenPlatformAppCapabilities
}>()

const { t } = useI18n()
const { toast } = useToast()
const projectStore = useProjectStore()
const {
  apps,
  lastError,
  isBusy,
  isServerListLoading,
  refresh,
  serverError,
  create,
  remove,
  publish,
  publishRemote,
  pickZip,
  peekZip,
  open,
  unpublish
} = useOpenPlatformApps({ api: props.api, capabilities: props.capabilities })

const PUBLISH_FIELDS: PublishField[] = [
  { key: 'id', required: true, kind: 'input' },
  { key: 'name', required: true, kind: 'input' },
  { key: 'version', required: true, kind: 'input', placeholder: '1.0.0' },
  { key: 'entry', required: true, kind: 'input', placeholder: 'web-ui/index.html' },
  { key: 'icon', required: false, kind: 'input', placeholder: 'icon.png' },
  { key: 'description', required: false, kind: 'textarea' },
  { key: 'spawn', required: false, kind: 'input', placeholder: 'node node/server.js' }
]

const publishTarget = ref<OpenPlatformAppCard | null>(null)
const publishForm = ref<AppManifestFormFields>(emptyManifestForm())
const publishZipPath = ref('')
const publishOrgNames = ref('')
const publishProvider = ref('')
const publishError = ref('')
const isPublishConfirmVisible = ref(false)
const pendingPublishRequest = ref<PendingPublishRequest | null>(null)
const publishConfirmContainer = ref<HTMLDivElement | null>(null)
const isPublishing = ref(false)
const isChoosingZip = ref(false)
let publishSequence = 0

const isDialogBusy = computed(() => isPublishing.value || isChoosingZip.value)
const publishConfirmDescription = computed(() =>
  pendingPublishRequest.value
    ? `将提交「${pendingPublishRequest.value.target.name}」的 ${
        pendingPublishRequest.value.fields.version
      } 版本。`
    : '将提交当前发布表单内容。'
)

const FIELD_LABEL_KEYS: Record<string, string> = {
  id: 'devCenterPublishFieldId',
  name: 'devCenterPublishFieldName',
  version: 'devCenterPublishFieldVersion',
  entry: 'devCenterPublishFieldEntry',
  icon: 'devCenterPublishFieldIcon',
  description: 'devCenterPublishFieldDescription',
  spawn: 'devCenterPublishFieldSpawn'
}

function fieldLabel(key: string): string {
  const labelKey = FIELD_LABEL_KEYS[key]
  return labelKey ? t(`routes.${labelKey}`) : key
}

function publishFormIssueText(fields: AppManifestFormFields): string {
  const issue = inspectManifestRecord(fields)
  if (!issue) return ''
  if (issue.kind === 'required') {
    return t('routes.devCenterPublishMissing', { fields: issue.fields.join('、') })
  }
  if (issue.kind === 'slot') return t('routes.devCenterPublishSlot')
  if (issue.kind === 'id') return '应用 ID 只能使用小写字母、数字和中划线'
  return t('routes.devCenterPublishVersion')
}

function buildAuthFromOrgNames(value: string): OpenPlatformAppAuth | null {
  const orgNames = value.trim()
  if (!orgNames) return null
  return { orgs: [], orgNames, userIds: [], phones: [] }
}

function openPublishDialog(app: OpenPlatformAppCard): void {
  if (isDialogBusy.value) return
  publishSequence += 1
  publishForm.value = { ...emptyManifestForm(), id: app.id }
  publishOrgNames.value = app.serverAuth?.orgNames ?? ''
  publishProvider.value = app.serverProvider ?? ''
  publishZipPath.value = ''
  publishError.value = ''
  isPublishConfirmVisible.value = false
  pendingPublishRequest.value = null
  publishTarget.value = app
}

async function choosePublishZip(): Promise<void> {
  const target = publishTarget.value
  if (!target || isDialogBusy.value) return
  isChoosingZip.value = true
  try {
    const filePath = await pickZip()
    if (!filePath || publishTarget.value !== target) return
    publishZipPath.value = filePath
    publishError.value = ''
    const fields = await peekZip(filePath)
    if (publishTarget.value !== target) return
    if (!fields) {
      publishZipPath.value = ''
      publishForm.value = { ...emptyManifestForm(), id: target.id }
      return
    }
    if (fields.id !== target.id) {
      publishZipPath.value = ''
      publishForm.value = { ...emptyManifestForm(), id: target.id }
      publishError.value = '应用 ID 与当前应用不一致'
      return
    }
    publishForm.value = { ...fields }
  } finally {
    isChoosingZip.value = false
  }
}

function closePublishDialog(): void {
  if (isPublishing.value) return
  publishSequence += 1
  publishTarget.value = null
  publishError.value = ''
  isPublishConfirmVisible.value = false
  pendingPublishRequest.value = null
}

function createPendingPublishRequest(): PendingPublishRequest | null {
  const target = publishTarget.value
  if (!target || isDialogBusy.value) return null
  if (!publishZipPath.value) {
    publishError.value = t('routes.devCenterPublishZipRequired')
    return null
  }
  const fields = { ...publishForm.value }
  publishError.value = publishFormIssueText(fields)
  if (publishError.value) return null
  const provider = publishProvider.value.trim()
  if (!provider) {
    publishError.value = t('routes.openPlatformPublishOrganizationRequired')
    return null
  }
  const auth = buildAuthFromOrgNames(publishOrgNames.value)

  return { target, fields, auth, provider, zipPath: publishZipPath.value }
}

function handlePublishConfirmVisible(visible: boolean): void {
  if (!visible) {
    isPublishConfirmVisible.value = false
    return
  }

  const request = createPendingPublishRequest()
  if (!request) return
  pendingPublishRequest.value = request
  isPublishConfirmVisible.value = true
}

async function submitPendingPublish(): Promise<void> {
  const request = pendingPublishRequest.value
  if (!request) return
  pendingPublishRequest.value = null
  isPublishConfirmVisible.value = false
  await submitPublish(
    request.target,
    request.fields,
    request.auth,
    request.provider,
    request.zipPath
  )
}

async function submitPublish(
  target: OpenPlatformAppCard,
  fields: AppManifestFormFields,
  auth: OpenPlatformAppAuth | null,
  provider: string,
  zipPath: string
): Promise<void> {
  const sequence = publishSequence
  isPublishing.value = true
  try {
    const ok = target.dir
      ? await publish(target, {
          fields,
          zipPath: publishZipPath.value,
          auth,
          provider
        })
      : await publishRemote(target, { fields, auth, provider, zipPath })
    if (publishSequence !== sequence || publishTarget.value !== target) return
    if (!ok) return
    publishSequence += 1
    publishTarget.value = null
    publishError.value = ''
    toast({
      title:
        target.serverStatus === 'local'
          ? '发布成功'
          : target.serverStatus === 'unpublished'
            ? '重新发布成功'
            : '更新成功'
    })
  } finally {
    isPublishing.value = false
  }
}

async function handleUnpublish(app: OpenPlatformAppCard): Promise<void> {
  const isUnpublished = await unpublish(app)
  if (isUnpublished) toast({ title: '下架成功' })
}

async function handleRevealDir(app: OpenPlatformAppCard): Promise<void> {
  if (!app.dir || isBusy.value) return
  try {
    await projectStore.openDirectory(app.dir)
  } catch {
    toast({ title: t('routes.devCenterOpenDirFailed'), variant: 'destructive' })
  }
}

async function openDocs(): Promise<void> {
  window.open(DEV_DOCS_URL, '_blank', 'noopener')
}

function splitDir(dir: string): { head: string; tail: string } {
  const trimmed = dir.replace(/[/\\]+$/, '')
  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (separatorIndex < 0) return { head: '', tail: trimmed || dir }
  return {
    head: trimmed.slice(0, separatorIndex + 1),
    tail: trimmed.slice(separatorIndex + 1)
  }
}

watch(lastError, (error) => {
  if (!error) return
  toast({
    title:
      error.message === 'MISSING'
        ? t('routes.embeddedAppMissing')
        : error.message || t('routes.devCenterCreateFailed'),
    variant: 'destructive'
  })
})
</script>

<template>
  <section class="open-platform-pane">
    <header class="open-platform-pane__head">
      <div>
        <h2>{{ MODULE_META.title }}</h2>
        <p>
          {{ MODULE_META.subtitle }}
          <button type="button" class="open-platform-pane__intro-link" @click="openDocs">
            了解更多
          </button>
        </p>
      </div>
      <div class="open-platform-pane__actions">
        <Button
          type="primary"
          size="small"
          :disabled="isBusy"
          data-testid="open-platform-create-app"
          @click="create()"
        >
          <Icon icon="lucide:folder-plus" />
          {{ t('routes.devCenterCreate') }}
        </Button>
      </div>
    </header>

    <div class="open-platform-pane__body">
      <div v-if="serverError" class="open-platform-pane__list-error">
        <span>{{ t('routes.openPlatformListFailed') }}</span>
        <Button type="outline" size="small" @click="refresh">
          {{ t('routes.openPlatformRetry') }}
        </Button>
      </div>

      <p v-if="isServerListLoading" class="open-platform-pane__empty">
        {{ t('routes.openPlatformLoading') }}
      </p>
      <div v-else-if="apps.length === 0" class="open-platform-pane__empty">
        {{ t('routes.devCenterEmpty') }}
      </div>
      <div v-else class="open-platform-pane__grid">
        <article v-for="app in apps" :key="app.id" class="open-platform-pane__card">
          <div class="open-platform-pane__card-head">
            <img
              v-if="app.iconSrc"
              :src="app.iconSrc"
              alt=""
              class="open-platform-pane__app-icon"
            />
            <div v-else class="open-platform-pane__icon">
              <Icon icon="lucide:layout-grid" />
            </div>
            <div>
              <div class="open-platform-pane__name">{{ app.name }}</div>
              <div class="open-platform-pane__meta">
                <span>{{ app.id }}</span>
                <span>v{{ app.publishedVersion || app.version }}</span>
              </div>
            </div>
          </div>
          <p class="open-platform-pane__desc">{{ app.description }}</p>
          <Button
            v-if="app.dir"
            type="text"
            size="small"
            class="open-platform-pane__dir"
            :title="app.dir"
            :disabled="isBusy"
            @click="handleRevealDir(app)"
          >
            <span>{{ splitDir(app.dir).head }}</span>
            <span>{{ splitDir(app.dir).tail }}</span>
          </Button>
          <footer>
            <span class="open-platform-pane__status" :class="`is-${app.serverStatus}`">
              {{
                app.serverStatus === 'published'
                  ? t('routes.openPlatformStatusPublished')
                  : app.serverStatus === 'unpublished'
                    ? t('routes.openPlatformStatusUnpublished')
                    : t('routes.openPlatformStatusLocal')
              }}
            </span>
            <div class="open-platform-pane__card-actions">
              <ConfirmAction
                v-if="app.serverStatus === 'local' || app.serverStatus === 'unpublished'"
                label="移除"
                description="移除后当前列表将不再显示该应用。"
                confirm-label="确认移除"
                variant="outline"
                confirm-variant="destructive"
                :disabled="isBusy"
                :test-id="`open-platform-app-remove-${app.id}`"
                @confirm="remove(app)"
              />
              <ConfirmAction
                v-if="!app.dir"
                label="关联本地目录"
                description="将选择本地目录并关联当前应用。"
                confirm-label="确认关联"
                variant="outline"
                :disabled="isBusy"
                :test-id="`open-platform-app-associate-${app.id}`"
                @confirm="create(app.id)"
              />
              <ConfirmAction
                v-if="app.serverStatus === 'published'"
                label="下架"
                description="下架后市场将不再展示该应用。"
                confirm-label="确认下架"
                variant="default"
                confirm-variant="destructive"
                :disabled="isBusy"
                :test-id="`open-platform-app-unpublish-${app.id}`"
                @confirm="handleUnpublish(app)"
              />
              <Button
                type="primary"
                size="small"
                :disabled="isBusy"
                :test-id="`open-platform-app-publish-${app.id}`"
                @click="openPublishDialog(app)"
              >
                {{
                  app.serverStatus === 'local'
                    ? t('routes.devCenterPublish')
                    : app.serverStatus === 'unpublished'
                      ? '重新发布'
                      : t('routes.openPlatformUpdate')
                }}
              </Button>
              <Button
                v-if="app.openable"
                type="primary"
                size="small"
                :disabled="isBusy"
                :test-id="`open-platform-app-open-${app.id}`"
                @click="open(app)"
              >
                <Icon icon="lucide:app-window" />
                {{ t('routes.appCenterOpen') }}
              </Button>
            </div>
          </footer>
        </article>
      </div>
    </div>

    <Dialog :open="publishTarget !== null" @update:open="(value) => !value && closePublishDialog()">
      <DialogContent class="open-platform-pane__dialog">
        <DialogHeader>
          <DialogTitle>
            {{
              publishTarget?.serverStatus === 'local'
                ? t('routes.devCenterPublishTitle')
                : publishTarget?.serverStatus === 'unpublished'
                  ? '重新发布应用'
                  : t('routes.openPlatformUpdate')
            }}
          </DialogTitle>
          <DialogDescription>{{ t('routes.openPlatformPublishSubtitle') }}</DialogDescription>
        </DialogHeader>
        <div class="open-platform-pane__form">
          <label class="open-platform-pane__field">
            <span class="open-platform-pane__required-label">
              <span class="open-platform-pane__required-star">*</span>
              {{ t('routes.devCenterPublishZipLabel') }}：
            </span>
            <div class="open-platform-pane__zip-row">
              <Input :model-value="publishZipPath" readonly />
              <Button
                type="outline"
                size="small"
                :disabled="isDialogBusy"
                @click="choosePublishZip"
              >
                {{ t('routes.devCenterPublishZipPick') }}
              </Button>
            </div>
          </label>
          <label v-for="field in PUBLISH_FIELDS" :key="field.key" class="open-platform-pane__field">
            <span :class="{ 'open-platform-pane__required-label': field.required }">
              <span v-if="field.required" class="open-platform-pane__required-star">*</span>
              {{ fieldLabel(field.key) }}：
            </span>
            <Textarea
              v-if="field.kind === 'textarea'"
              v-model="publishForm.description"
              class="open-platform-pane__desc-input"
            />
            <Input
              v-else
              v-model="publishForm[field.key]"
              :disabled="field.key === 'id'"
              :placeholder="field.placeholder"
            />
          </label>
          <label class="open-platform-pane__field">
            <span class="open-platform-pane__required-label">
              <span class="open-platform-pane__required-star">*</span>
              {{ t('routes.openPlatformPublishOrganization') }}：
            </span>
            <Input
              v-model="publishProvider"
              :disabled="isDialogBusy"
              :data-testid="`open-platform-app-provider-${publishTarget?.id}`"
              :placeholder="t('routes.openPlatformPublishOrganizationPlaceholder')"
            />
          </label>
          <label class="open-platform-pane__field">
            <span>{{ t('routes.openPlatformAuth') }}</span>
            <Textarea
              v-model="publishOrgNames"
              class="open-platform-pane__auth-input"
              :placeholder="t('routes.openPlatformAuthPlaceholder')"
            />
          </label>
          <p v-if="publishError" class="open-platform-pane__error">{{ publishError }}</p>
        </div>
        <DialogFooter>
          <div ref="publishConfirmContainer" class="open-platform-pane__dialog-footer">
            <Button
              type="outline"
              size="small"
              :disabled="isDialogBusy"
              @click="closePublishDialog"
            >
              {{ t('routes.devCenterCancel') }}
            </Button>
            <ConfirmAction
              :label="t('routes.devCenterConfirm')"
              :description="publishConfirmDescription"
              :confirm-label="t('routes.devCenterConfirm')"
              variant="default"
              :disabled="isDialogBusy"
              :popup-visible="isPublishConfirmVisible"
              :popup-container="publishConfirmContainer ?? undefined"
              @update:popup-visible="handlePublishConfirmVisible"
              @confirm="submitPendingPublish"
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
