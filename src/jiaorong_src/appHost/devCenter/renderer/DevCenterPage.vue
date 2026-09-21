<script setup lang="ts">
// 组件名固定，供路由匹配与调试面板识别
defineOptions({ name: 'DevCenterPage' })

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import { useToast } from '@/components/use-toast'
import type { JiaorongDevCenterItem } from '@jiaorong/appHost/types'
import {
  APP_MANIFEST_SLOTS,
  buildManifestJson,
  emptyManifestForm,
  inspectManifestRecord,
  type AppManifestFormFields
} from '@jiaorong/appHost/manifestRules'
import { useJiaorongDevCenter } from './useJiaorongDevCenter'
import './DevCenterPage.less'

const { t } = useI18n()
const { toast } = useToast()
const { apps, lastError, create, remove, publish, pickZip, peekZip, downloadSample, open } =
  useJiaorongDevCenter()

/** 发布表单字段：中文标签 + 悬浮说明。 */
type PublishField = {
  key: keyof AppManifestFormFields
  required: boolean
  kind: 'input' | 'select' | 'textarea'
  placeholder?: string
}

const PUBLISH_FIELDS: PublishField[] = [
  { key: 'id', required: true, kind: 'input' },
  { key: 'name', required: true, kind: 'input' },
  { key: 'version', required: true, kind: 'input', placeholder: '1.0.0' },
  { key: 'entry', required: true, kind: 'input', placeholder: 'web-ui/index.html' },
  { key: 'slot', required: true, kind: 'select' },
  { key: 'icon', required: false, kind: 'input', placeholder: 'icon.png' },
  { key: 'description', required: false, kind: 'textarea' },
  { key: 'spawn', required: false, kind: 'input', placeholder: 'node node/server.js' }
]

/** 字段中文名 i18n key。 */
const FIELD_LABEL_KEYS: Record<string, string> = {
  id: 'devCenterPublishFieldId',
  name: 'devCenterPublishFieldName',
  version: 'devCenterPublishFieldVersion',
  entry: 'devCenterPublishFieldEntry',
  slot: 'devCenterPublishFieldSlot',
  icon: 'devCenterPublishFieldIcon',
  description: 'devCenterPublishFieldDescription',
  spawn: 'devCenterPublishFieldSpawn'
}

/** 字段悬浮说明 i18n key。 */
const FIELD_HINT_KEYS: Record<string, string> = {
  id: 'devCenterPublishHintId',
  name: 'devCenterPublishHintName',
  version: 'devCenterPublishHintVersion',
  entry: 'devCenterPublishHintEntry',
  slot: 'devCenterPublishHintSlot',
  icon: 'devCenterPublishHintIcon',
  description: 'devCenterPublishHintDescription',
  spawn: 'devCenterPublishHintSpawn',
  zip: 'devCenterPublishZipHint'
}

/** slot 选项中文名。 */
const SLOT_LABEL_KEYS: Record<string, string> = {
  menu: 'devCenterPublishSlotMenu',
  'app-center': 'devCenterPublishSlotAppCenter'
}

/**
 * 字段中文名。
 * @param key app.json 字段
 */
function fieldLabel(key: string): string {
  const i18nKey = FIELD_LABEL_KEYS[key]
  return i18nKey ? t(`routes.${i18nKey}`) : key
}

/**
 * 字段悬浮说明。
 * @param key app.json 字段或 zip
 */
function fieldHint(key: string): string {
  const i18nKey = FIELD_HINT_KEYS[key]
  return i18nKey ? t(`routes.${i18nKey}`) : ''
}

/** 发布弹窗目标应用；null 表示关闭。 */
const publishTarget = ref<JiaorongDevCenterItem | null>(null)
/** 从 zip 回填、可改的最终版清单。 */
const publishForm = ref<AppManifestFormFields>(emptyManifestForm())
/** 已选 zip 包路径。 */
const publishZipPath = ref('')
/** 点确定后的校验错误。 */
const publishError = ref('')
/** 发布提交中。 */
const isPublishing = ref(false)

/**
 * 把校验结果收成界面文案。
 * @param fields 当前表单
 */
function publishFormIssueText(fields: AppManifestFormFields): string {
  const issue = inspectManifestRecord(fields)
  if (!issue) return ''
  if (issue.kind === 'required') {
    return t('routes.devCenterPublishMissing', {
      fields: issue.fields.map((key) => fieldLabel(key)).join('、')
    })
  }
  if (issue.kind === 'slot') return t('routes.devCenterPublishSlot')
  return t('routes.devCenterPublishVersion')
}

/** 打开发布弹窗：先选 zip，再回填 app.json。 */
function openPublishDialog(app: JiaorongDevCenterItem): void {
  publishForm.value = emptyManifestForm()
  publishZipPath.value = ''
  publishError.value = ''
  publishTarget.value = app
}

/** 选择 zip 包并回填 app.json。 */
async function choosePublishZip(): Promise<void> {
  /** 主进程返回的路径。 */
  const filePath = await pickZip()
  if (!filePath) return
  publishZipPath.value = filePath
  publishError.value = ''
  /** zip 内清单。 */
  const fields = await peekZip(filePath)
  if (!fields) {
    publishForm.value = emptyManifestForm()
    return
  }
  publishForm.value = { ...fields }
}

/** 关闭发布弹窗。 */
function closePublishDialog(): void {
  publishTarget.value = null
  publishError.value = ''
}

/** 确认发布：校验表单，写回 zip 内 app.json 后提交。 */
async function confirmPublish(): Promise<void> {
  /** 弹窗目标。 */
  const target = publishTarget.value
  if (!target || isPublishing.value) return
  if (!publishZipPath.value) {
    publishError.value = t('routes.devCenterPublishZipRequired')
    return
  }
  /** 当前表单快照。 */
  const fields = { ...publishForm.value }
  publishError.value = publishFormIssueText(fields)
  if (publishError.value) return
  isPublishing.value = true
  try {
    /** 主进程发布结果。 */
    const ok = await publish(target, {
      manifestJson: buildManifestJson(fields),
      zipPath: publishZipPath.value
    })
    if (!ok) return
    closePublishDialog()
    toast({ title: t('routes.devCenterPublishPending') })
  } finally {
    isPublishing.value = false
  }
}

// 主进程返回的失败信息统一走 toast
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
  <div class="app-center-page dev-center-page">
    <header class="app-center-page__header">
      <div>
        <h1 class="app-center-page__title">{{ t('routes.devCenter') }}</h1>
        <p class="app-center-page__subtitle">{{ t('routes.devCenterSubtitle') }}</p>
      </div>
      <Button size="sm" data-testid="dev-center-create" @click="create">
        <Icon icon="lucide:folder-plus" class="dev-center-page__create-icon" />
        {{ t('routes.devCenterCreate') }}
      </Button>
    </header>

    <div v-if="apps.length === 0" class="app-center-page__empty">
      {{ t('routes.devCenterEmpty') }}
    </div>

    <div v-else class="app-center-page__grid">
      <article
        v-for="app in apps"
        :key="`${app.sample ? 'sample' : 'local'}:${app.id}`"
        class="app-center-card"
      >
        <div class="app-center-card__head">
          <img v-if="app.iconSrc" :src="app.iconSrc" alt="" class="app-center-card__icon" />
          <Icon v-else icon="lucide:layout-grid" class="app-center-card__icon-fallback" />
          <div class="app-center-card__meta">
            <div class="app-center-card__name">
              {{ app.name }}
              <span v-if="app.sample" class="app-center-card__dev-badge">
                {{ t('routes.devCenterSampleBadge') }}
              </span>
            </div>
            <div class="app-center-card__version">v{{ app.version }}</div>
          </div>
        </div>

        <p class="app-center-card__desc">{{ app.description }}</p>

        <div class="app-center-card__foot">
          <span class="app-center-card__provider">{{ app.provider }}</span>
          <div class="app-center-card__actions">
            <Button
              v-if="app.sample"
              variant="outline"
              size="sm"
              class="app-center-card__action-btn"
              data-testid="dev-center-download"
              @click="downloadSample"
            >
              {{ t('routes.devCenterDownload') }}
            </Button>
            <template v-else>
              <Button
                variant="ghost"
                size="sm"
                class="app-center-card__action-btn"
                :data-testid="`dev-center-remove-${app.id}`"
                @click="remove(app)"
              >
                {{ t('routes.devCenterRemove') }}
              </Button>
              <Button
                size="sm"
                class="app-center-card__action-btn"
                :data-testid="`dev-center-publish-${app.id}`"
                @click="openPublishDialog(app)"
              >
                {{ t('routes.devCenterPublish') }}
              </Button>
            </template>
            <Button
              v-if="app.openable"
              size="sm"
              class="app-center-card__action-btn"
              :data-testid="`dev-center-open-${app.id}`"
              @click="open(app)"
            >
              {{ t('routes.appCenterOpen') }}
            </Button>
          </div>
        </div>
        <p v-if="app.dir" class="dev-center-page__dir" :title="app.dir">{{ app.dir }}</p>
      </article>
    </div>

    <TooltipProvider :delay-duration="200">
      <Dialog :open="publishTarget !== null" @update:open="(open) => !open && closePublishDialog()">
        <DialogContent class="dev-center-page__dialog">
          <div class="dev-center-page__dialog-body">
            <DialogHeader class="dev-center-page__dialog-header">
              <DialogTitle>{{ t('routes.devCenterPublishTitle') }}</DialogTitle>
              <DialogDescription>
                {{
                  publishTarget
                    ? `${publishTarget.name} v${publishTarget.version}。${t('routes.devCenterPublishSubtitle')}`
                    : t('routes.devCenterPublishSubtitle')
                }}
              </DialogDescription>
            </DialogHeader>
            <div class="dev-center-page__form">
              <div class="dev-center-page__field">
                <span class="dev-center-page__field-label">
                  <span>
                    {{ t('routes.devCenterPublishZipLabel') }}
                    <span class="dev-center-page__required">*</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button type="button" class="dev-center-page__hint" tabindex="-1">
                        <Icon icon="lucide:info" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent class="dev-center-page__hint-pop">
                      {{ fieldHint('zip') }}
                    </TooltipContent>
                  </Tooltip>
                </span>
                <div class="dev-center-page__zip-row">
                  <Input
                    :model-value="publishZipPath"
                    readonly
                    :placeholder="t('routes.devCenterPublishZipPlaceholder')"
                    class="dev-center-page__zip-input"
                  />
                  <Button variant="outline" size="sm" @click="choosePublishZip">
                    {{ t('routes.devCenterPublishZipPick') }}
                  </Button>
                </div>
              </div>
              <label
                v-for="field in PUBLISH_FIELDS"
                :key="field.key"
                class="dev-center-page__field"
              >
                <span class="dev-center-page__field-label">
                  <span>
                    {{ fieldLabel(field.key) }}
                    <span v-if="field.required" class="dev-center-page__required">*</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button type="button" class="dev-center-page__hint" tabindex="-1">
                        <Icon icon="lucide:info" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent class="dev-center-page__hint-pop">
                      {{ fieldHint(field.key) }}
                    </TooltipContent>
                  </Tooltip>
                </span>
                <select
                  v-if="field.kind === 'select'"
                  v-model="publishForm.slot"
                  class="dev-center-page__select"
                >
                  <option v-for="slot in APP_MANIFEST_SLOTS" :key="slot" :value="slot">
                    {{ t(`routes.${SLOT_LABEL_KEYS[slot]}`) }}
                  </option>
                </select>
                <Textarea
                  v-else-if="field.kind === 'textarea'"
                  v-model="publishForm.description"
                  class="dev-center-page__desc"
                />
                <Input
                  v-else
                  v-model="publishForm[field.key]"
                  :placeholder="field.placeholder"
                  :data-testid="`dev-center-publish-${field.key}`"
                />
              </label>
              <p v-if="publishError" class="dev-center-page__error">{{ publishError }}</p>
            </div>
            <DialogFooter class="dev-center-page__dialog-footer">
              <Button variant="outline" size="sm" @click="closePublishDialog">
                {{ t('routes.devCenterCancel') }}
              </Button>
              <Button size="sm" :disabled="isPublishing" @click="confirmPublish">
                {{ t('routes.devCenterConfirm') }}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  </div>
</template>
