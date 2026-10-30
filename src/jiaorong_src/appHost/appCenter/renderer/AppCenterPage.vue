<script setup lang="ts">
// 组件名固定，供路由匹配与调试面板识别
defineOptions({ name: 'AppCenterPage' })

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Input } from '@shadcn/components/ui/input'
import { DcButton } from '@dc-ui/components/button'
import { useToast } from '@/components/use-toast'
import type { JiaorongAppCenterItem } from '@jiaorong/appHost/types'
import skillEmptyArt from '@jiaorong/assets/skill-empty.png'
import { useJiaorongAppCenter } from './useJiaorongAppCenter'
import './AppCenterPage.less'

const { t } = useI18n()
const { toast } = useToast()
const {
  apps,
  lastError,
  isRefreshing,
  isBusy,
  refresh,
  isInstalling,
  isOpening,
  install,
  uninstall,
  open
} = useJiaorongAppCenter()

type AppFilter = 'all' | 'installed' | 'uninstalled'

const APP_FILTERS: AppFilter[] = ['all', 'installed', 'uninstalled']
const FILTER_LABEL_KEYS = {
  all: 'routes.appCenterFilterAll',
  installed: 'routes.appCenterFilterInstalled',
  uninstalled: 'routes.appCenterFilterUninstalled'
} as const

const searchQuery = ref('')
const activeFilter = ref<AppFilter>('all')

/** 安装中仍视作未安装，便于用户在「未安装」里继续看到进度 */
const isInstalledApp = (app: JiaorongAppCenterItem): boolean =>
  app.installStatus === 'installed' || app.installStatus === 'update_available'

const filteredApps = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return apps.value.filter((app) => {
    const installed = isInstalledApp(app)
    if (activeFilter.value === 'installed' && !installed) return false
    if (activeFilter.value === 'uninstalled' && installed) return false
    if (!keyword) return true
    return `${app.name} ${app.description ?? ''}`.toLowerCase().includes(keyword)
  })
})

/**
 * 主操作按钮文案键：已装给更新 / 打开，未装给安装。
 * @param app 卡片项
 */
function primaryActionKey(app: JiaorongAppCenterItem): string {
  if (isInstalling(app)) return 'routes.appCenterInstalling'
  if (app.installStatus === 'update_available') return 'routes.appCenterUpdate'
  return 'routes.appCenterInstall'
}

/**
 * 卡片版本号文案：未装给目录版本，已装给已装版本，有更新给「已装 → 目录」。
 * @param app 卡片项
 */
function versionLabel(app: JiaorongAppCenterItem): string {
  if (app.installStatus === 'update_available' && app.installedVersion) {
    return `v${app.installedVersion} → v${app.version}`
  }
  if (app.installedVersion) return `v${app.installedVersion}`
  return `v${app.version}`
}

/** 是否展示主操作（安装 / 更新）；无安装来源时已装只给打开。 */
function showPrimaryAction(app: JiaorongAppCenterItem): boolean {
  if (isInstalling(app)) return true
  if (!app.remotePackage && !app.localPackagePath) return false
  return app.installStatus !== 'installed'
}

/** 卡片提供方文案；远端市场记录返回发布组织。 */
function providerLabel(app: JiaorongAppCenterItem): string {
  if (app.installStatus === 'error') return t('routes.appCenterStatusError')
  if (!app.provider || app.provider === '本地') return ''
  return `由 ${app.provider} 提供`
}

// 主进程返回的失败信息统一走 toast
watch(lastError, (error) => {
  if (!error) return
  toast({
    title:
      error.message === 'MISSING'
        ? t('routes.embeddedAppMissing')
        : error.message || t('routes.appCenterInstallError'),
    variant: 'destructive'
  })
})
</script>

<template>
  <div class="app-center-page">
    <header class="app-center-page__header">
      <h1 class="app-center-page__title">{{ t('routes.openPlatformTab_apps') }}</h1>
      <DcButton
        variant="outline"
        icon="lucide:refresh-cw"
        data-testid="app-center-refresh"
        :loading="isRefreshing"
        :disabled="isRefreshing || isBusy"
        @click="refresh"
      >
        {{ t('common.browser.reload') }}
      </DcButton>
    </header>

    <div class="app-center-page__toolbar">
      <div class="app-center-page__search">
        <Icon icon="lucide:search" class="app-center-page__search-icon" aria-hidden="true" />
        <Input
          v-model="searchQuery"
          class="app-center-page__search-input"
          :placeholder="t('routes.appCenterSearch')"
        />
      </div>
      <div class="app-center-page__segments">
        <button
          v-for="filter in APP_FILTERS"
          :key="filter"
          type="button"
          class="app-center-page__segment"
          :class="{ 'is-active': activeFilter === filter }"
          :data-testid="`app-center-filter-${filter}`"
          @click="activeFilter = filter"
        >
          {{ t(FILTER_LABEL_KEYS[filter]) }}
        </button>
      </div>
    </div>

    <div v-if="filteredApps.length === 0" class="app-center-page__empty">
      <img :src="skillEmptyArt" alt="" class="app-center-page__empty-image" />
      <p class="app-center-page__empty-text">
        {{
          searchQuery || activeFilter !== 'all'
            ? t('routes.appCenterNoResult')
            : t('routes.appCenterEmpty')
        }}
      </p>
    </div>

    <div v-else class="app-center-page__grid">
      <article v-for="app in filteredApps" :key="app.id" class="app-center-card">
        <div class="app-center-card__head">
          <img v-if="app.iconSrc" :src="app.iconSrc" alt="" class="app-center-card__icon" />
          <div v-else class="app-center-card__icon-bg">
            <Icon icon="lucide:layout-grid" class="app-center-card__icon-fallback" />
          </div>
          <h3 class="app-center-card__name">{{ app.name }}</h3>
          <span v-if="app.developerOnly" class="app-center-card__badge">
            {{ t('routes.appCenterDevOnly') }}
          </span>
          <span class="app-center-card__badge">{{ versionLabel(app) }}</span>
        </div>

        <p class="app-center-card__desc">{{ app.description }}</p>

        <div class="app-center-card__foot">
          <span
            class="app-center-card__provider"
            :class="{ 'is-error': app.installStatus === 'error' }"
          >
            {{ providerLabel(app) }}
          </span>
          <div class="app-center-card__actions">
            <Button
              v-if="app.canUninstall"
              variant="ghost"
              size="sm"
              class="app-center-card__action-btn"
              :disabled="isBusy"
              :data-testid="`app-center-uninstall-${app.id}`"
              @click="uninstall(app)"
            >
              {{ t('routes.appCenterUninstall') }}
            </Button>
            <Button
              v-if="app.openable"
              size="sm"
              class="app-center-card__action-btn"
              :disabled="isBusy"
              :data-testid="`app-center-open-${app.id}`"
              @click="open(app)"
            >
              <Icon
                v-if="isOpening(app)"
                icon="lucide:loader-circle"
                class="app-center-card__action-spin"
              />
              {{ t('routes.appCenterOpen') }}
            </Button>
            <Button
              v-if="showPrimaryAction(app)"
              variant="outline"
              size="sm"
              class="app-center-card__action-btn"
              :disabled="isBusy"
              :data-testid="`app-center-install-${app.id}`"
              @click="install(app)"
            >
              <Icon
                v-if="isInstalling(app)"
                icon="lucide:loader-circle"
                class="app-center-card__action-spin"
              />
              {{ t(primaryActionKey(app)) }}
            </Button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
