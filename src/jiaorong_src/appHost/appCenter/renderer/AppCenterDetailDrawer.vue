<script setup lang="ts">
/** 交融应用详情：右侧抽屉，只展示列表卡片上已有的数据。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import type { JiaorongAppCenterItem, JiaorongAppInstallStatus } from '@jiaorong/appHost/types'
import './AppCenterDetailDrawer.less'

const props = defineProps<{
  app: JiaorongAppCenterItem | null
  versionText: string
  busy: boolean
  installing: boolean
  opening: boolean
  showInstall: boolean
  installLabel: string
}>()

const emit = defineEmits<{
  close: []
  install: [app: JiaorongAppCenterItem]
  open: [app: JiaorongAppCenterItem]
  uninstall: [app: JiaorongAppCenterItem]
}>()

const { t } = useI18n()

const STATUS_KEYS: Record<JiaorongAppInstallStatus, string> = {
  not_installed: 'routes.appCenterStatusNotInstalled',
  installed: 'routes.appCenterStatusInstalled',
  update_available: 'routes.appCenterStatusUpdate',
  installing: 'routes.appCenterInstalling',
  error: 'routes.appCenterStatusError'
}

type DetailRow = { label: string; value: string; tone?: 'ok' | 'accent' | 'muted' | 'danger' }

function statusTone(status: JiaorongAppInstallStatus): DetailRow['tone'] {
  if (status === 'installed') return 'ok'
  if (status === 'update_available' || status === 'installing') return 'accent'
  if (status === 'error') return 'danger'
  return 'muted'
}

/** 把接口时间收成到分钟的本地时间；解析不了就原样展示。 */
function formatTime(value?: string | null): string {
  const raw = value?.trim()
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (part: number) => String(part).padStart(2, '0')
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`
}

const providerText = computed(() => {
  const provider = props.app?.provider?.trim()
  if (!provider || provider === '本地') return ''
  return provider
})

const providerInitial = computed(() => providerText.value.slice(0, 2))

const sizeBytes = ref<number | null>(null)
const sizeState = ref<'loading' | 'ready' | 'package' | 'unavailable' | 'missing'>('unavailable')
const iconBroken = ref(false)
let sizeRequest = 0

function hasInstalledCopy(app: JiaorongAppCenterItem | null): boolean {
  return app?.installStatus === 'installed' || app?.installStatus === 'update_available'
}

/** 字节数收成 B / KB / MB / GB。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

async function loadInstalledSize(app: JiaorongAppCenterItem | null): Promise<void> {
  const request = ++sizeRequest
  if (!app) {
    sizeBytes.value = null
    sizeState.value = 'unavailable'
    return
  }
  sizeState.value = 'loading'
  try {
    if (hasInstalledCopy(app)) {
      const installedBytes = await window.jiaorongApps?.getAppCenterInstalledSize(app.id)
      if (request !== sizeRequest) return
      // 0 是空目录的真实大小，不能再去把安装包下下来
      if (typeof installedBytes === 'number' && installedBytes >= 0) {
        sizeBytes.value = installedBytes
        sizeState.value = 'ready'
        return
      }
    }
    const downloadUrl = app.downloadUrl?.trim()
    if (downloadUrl) {
      const packageBytes = await window.jiaorongApps?.getAppCenterPackageSize(downloadUrl)
      if (request !== sizeRequest) return
      if (typeof packageBytes === 'number' && packageBytes > 0) {
        sizeBytes.value = packageBytes
        sizeState.value = 'package'
        return
      }
    }
    if (request !== sizeRequest) return
    sizeBytes.value = null
    sizeState.value = hasInstalledCopy(app) ? 'missing' : 'unavailable'
  } catch {
    if (request !== sizeRequest) return
    sizeBytes.value = null
    sizeState.value = hasInstalledCopy(app) ? 'missing' : 'unavailable'
  }
}

const sizeText = computed(() => {
  if (sizeState.value === 'loading') return t('routes.appCenterSizeLoading')
  if (sizeState.value === 'ready' && sizeBytes.value != null) return formatBytes(sizeBytes.value)
  if (sizeState.value === 'package' && sizeBytes.value != null) {
    return t('routes.appCenterSizePackage', { size: formatBytes(sizeBytes.value) })
  }
  if (sizeState.value === 'missing') return t('routes.appCenterSizeMissing')
  return t('routes.appCenterSizeUnavailable')
})

watch(
  () => [props.app?.id ?? '', props.app?.installStatus ?? ''] as const,
  () => {
    void loadInstalledSize(props.app)
  },
  { immediate: true }
)

const rows = computed((): DetailRow[] => {
  const app = props.app
  if (!app) return []
  const list: DetailRow[] = [
    { label: t('routes.appCenterFieldId'), value: app.id },
    {
      label: t('routes.appCenterFieldStatus'),
      value: t(STATUS_KEYS[app.installStatus]),
      tone: statusTone(app.installStatus)
    },
    { label: t('routes.appCenterFieldVersion'), value: `v${app.version}` }
  ]
  if (app.installedVersion) {
    list.push({
      label: t('routes.appCenterFieldInstalledVersion'),
      value: `v${app.installedVersion}`
    })
  }
  if (providerText.value) {
    list.push({ label: t('routes.appCenterFieldDeveloper'), value: providerText.value })
  }
  const publishedAt = formatTime(app.publishedAt)
  if (publishedAt) {
    list.push({ label: t('routes.appCenterFieldPublishedAt'), value: publishedAt })
  }
  const updatedAt = formatTime(app.updatedAt)
  if (updatedAt) {
    list.push({ label: t('routes.appCenterFieldUpdatedAt'), value: updatedAt })
  }
  if (app.packageSha256) {
    list.push({
      label: t('routes.appCenterFieldPackage'),
      value: t('routes.appCenterPackageVerified')
    })
  }
  list.push({
    label: t('routes.appCenterFieldSize'),
    value: sizeText.value,
    tone: sizeState.value === 'ready' || sizeState.value === 'package' ? 'accent' : undefined
  })
  return list
})

function onKeydown(event: KeyboardEvent): void {
  if (!props.app || event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}

watch(
  () => props.app != null,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

watch(
  () => props.app?.iconSrc ?? '',
  () => {
    iconBroken.value = false
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="app" class="app-center-detail-mask" @click.self="emit('close')">
      <aside
        class="app-center-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-center-detail-title"
      >
        <header class="app-center-detail__header">
          <h2 id="app-center-detail-title">{{ t('routes.appCenterDetailTitle') }}</h2>
          <button
            type="button"
            class="app-center-detail__close"
            :aria-label="t('routes.appCenterDetailClose')"
            @click="emit('close')"
          >
            <Icon icon="lucide:x" />
          </button>
        </header>

        <div class="app-center-detail__body">
          <section class="app-center-detail__card app-center-detail__card--hero">
            <div class="app-center-detail__hero">
              <img
                v-if="app.iconSrc && !iconBroken"
                :src="app.iconSrc"
                alt=""
                class="app-center-detail__icon"
                @error="iconBroken = true"
              />
              <div v-else class="app-center-detail__icon-bg" aria-hidden="true">
                <Icon icon="lucide:layout-grid" />
              </div>
              <div class="app-center-detail__identity">
                <h3>{{ app.name }}</h3>
                <div class="app-center-detail__tags">
                  <span class="app-center-detail__version">{{ versionText }}</span>
                  <span class="app-center-detail__security">
                    <span class="app-center-detail__security-mark" aria-hidden="true">
                      <Icon icon="lucide:shield-check" class="app-center-detail__security-icon" />
                    </span>
                    {{ t('routes.appCenterSecurityChecked') }}
                  </span>
                  <span v-if="app.developerOnly" class="app-center-detail__badge">
                    {{ t('routes.appCenterDevOnly') }}
                  </span>
                </div>
              </div>
            </div>

            <p class="app-center-detail__desc" :class="{ 'is-empty': !app.description }">
              {{ app.description || t('routes.appCenterNoDescription') }}
            </p>
          </section>

          <section class="app-center-detail__card app-center-detail__card--info">
            <h4 class="app-center-detail__section-title">{{ t('routes.appCenterInfo') }}</h4>
            <ul class="app-center-detail__facts">
              <li v-for="row in rows" :key="row.label">
                <span>{{ row.label }}</span>
                <span :class="row.tone ? `is-${row.tone}` : undefined">{{ row.value }}</span>
              </li>
            </ul>
          </section>
        </div>

        <footer class="app-center-detail__footer">
          <span v-if="providerText" class="app-center-detail__provider">
            <span class="app-center-detail__provider-mark" aria-hidden="true">
              {{ providerInitial }}
            </span>
            {{ t('routes.appCenterProvidedBy', { provider: providerText }) }}
          </span>
          <div class="app-center-detail__actions">
            <Button
              v-if="app.canUninstall"
              variant="outline"
              size="sm"
              class="app-center-detail__action"
              :disabled="busy"
              @click="emit('uninstall', app)"
            >
              {{ t('routes.appCenterUninstall') }}
            </Button>
            <Button
              v-if="app.openable"
              size="sm"
              class="app-center-detail__action"
              :disabled="busy"
              @click="emit('open', app)"
            >
              <Icon v-if="opening" icon="lucide:loader-circle" class="app-center-detail__spin" />
              {{ t('routes.appCenterOpen') }}
            </Button>
            <Button
              v-if="showInstall"
              :variant="app.openable ? 'outline' : 'default'"
              size="sm"
              class="app-center-detail__action"
              :disabled="busy"
              @click="emit('install', app)"
            >
              <Icon v-if="installing" icon="lucide:loader-circle" class="app-center-detail__spin" />
              {{ installLabel }}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
