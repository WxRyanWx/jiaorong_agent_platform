<script setup lang="ts">
// 组件名固定，供路由匹配与调试面板识别
defineOptions({ name: 'AppCenterPage' })

import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { useToast } from '@/components/use-toast'
import type { JiaorongAppCenterItem } from '@jiaorong/appHost/types'
import { useJiaorongAppCenter } from './useJiaorongAppCenter'
import './AppCenterPage.less'

const { t } = useI18n()
const { toast } = useToast()
const { apps, lastError, isRefreshing, refresh, isInstalling, install, uninstall, open } =
  useJiaorongAppCenter()

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

/** 是否展示主操作（安装 / 更新）；本地手丢包没有远程安装，已装且无更新时只给打开。 */
function showPrimaryAction(app: JiaorongAppCenterItem): boolean {
  if (isInstalling(app)) return true
  if (!app.remotePackage) return false
  return app.installStatus !== 'installed'
}

// 主进程返回的失败信息统一走 toast
watch(lastError, (error) => {
  if (!error) return
  toast({
    title: error.message || t('routes.appCenterInstallError'),
    variant: 'destructive'
  })
})
</script>

<template>
  <div class="app-center-page">
    <header class="app-center-page__header">
      <div>
        <h1 class="app-center-page__title">{{ t('routes.appCenter') }}</h1>
        <p class="app-center-page__subtitle">{{ t('routes.appCenterPageSubtitle') }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid="app-center-refresh"
        :disabled="isRefreshing"
        @click="refresh"
      >
        <Icon
          icon="lucide:refresh-cw"
          class="app-center-page__refresh-icon"
          :class="{ 'is-spinning': isRefreshing }"
        />
      </Button>
    </header>

    <div v-if="apps.length === 0" class="app-center-page__empty">
      {{ t('routes.appCenterEmpty') }}
    </div>

    <div v-else class="app-center-page__grid">
      <article v-for="app in apps" :key="app.id" class="app-center-card">
        <div class="app-center-card__head">
          <img v-if="app.iconSrc" :src="app.iconSrc" alt="" class="app-center-card__icon" />
          <Icon v-else icon="lucide:layout-grid" class="app-center-card__icon-fallback" />
          <div class="app-center-card__meta">
            <div class="app-center-card__name">
              {{ app.name }}
              <span v-if="app.developerOnly" class="app-center-card__dev-badge">
                {{ t('routes.appCenterDevOnly') }}
              </span>
            </div>
            <div class="app-center-card__version">{{ versionLabel(app) }}</div>
          </div>
        </div>

        <p class="app-center-card__desc">{{ app.description }}</p>

        <div class="app-center-card__foot">
          <span
            class="app-center-card__provider"
            :class="{ 'is-error': app.installStatus === 'error' }"
          >
            {{ app.installStatus === 'error' ? t('routes.appCenterStatusError') : app.provider }}
          </span>
          <div class="app-center-card__actions">
            <Button
              v-if="app.canUninstall"
              variant="ghost"
              size="sm"
              class="app-center-card__action-btn"
              :data-testid="`app-center-uninstall-${app.id}`"
              @click="uninstall(app)"
            >
              {{ t('routes.appCenterUninstall') }}
            </Button>
            <Button
              v-if="app.openable"
              size="sm"
              class="app-center-card__action-btn"
              :disabled="isInstalling(app)"
              :data-testid="`app-center-open-${app.id}`"
              @click="open(app)"
            >
              {{ t('routes.appCenterOpen') }}
            </Button>
            <Button
              v-if="showPrimaryAction(app)"
              size="sm"
              class="app-center-card__action-btn"
              :disabled="isInstalling(app)"
              :data-testid="`app-center-install-${app.id}`"
              @click="install(app)"
            >
              {{ t(primaryActionKey(app)) }}
            </Button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
