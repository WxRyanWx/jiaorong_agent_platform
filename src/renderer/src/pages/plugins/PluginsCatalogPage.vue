<template>
  <ScrollArea class="h-full w-full">
    <div class="flex w-full flex-col gap-6 px-8 pt-6 pb-8">
      <header class="flex items-center justify-between gap-4">
        <h1
          class="tracking-normal"
          style="margin: 0; font-size: 24px; font-weight: 700; line-height: 34px; color: #0b2b57"
        >
          {{ t('routes.pluginCenterConnectors') }}
        </h1>
        <DcButton
          variant="outline"
          icon="lucide:refresh-cw"
          :loading="loading"
          :disabled="loading"
          @click="loadCatalog"
        >
          {{ t('common.browser.reload') }}
        </DcButton>
      </header>

      <div
        v-if="errorMessage"
        class="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"
      >
        {{ errorMessage }}
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="relative w-72 max-w-full">
          <Icon
            icon="lucide:search"
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="searchQuery"
            class="catalog-search-input"
            :placeholder="t('routes.pluginCenterConnectorsSearch')"
          />
        </div>
        <div class="ml-auto flex items-center gap-2">
          <button
            v-for="filter in CATALOG_FILTERS"
            :key="filter"
            type="button"
            class="catalog-segment"
            :class="{ 'is-active': activeFilter === filter }"
            @click="activeFilter = filter"
          >
            {{ t(FILTER_LABEL_KEYS[filter]) }}
          </button>
        </div>
      </div>

      <section class="space-y-4">
        <div v-if="filteredItems.length" class="grid gap-4 md:grid-cols-3">
          <article
            v-for="item in filteredItems"
            :key="item.id"
            :data-plugin-id="item.id"
            class="catalog-card flex min-w-0 flex-col rounded-xl border border-border bg-background p-4"
          >
            <div class="flex min-w-0 items-center gap-2">
              <Icon :icon="item.icon" class="size-5 shrink-0" :class="item.iconClass" />
              <h3 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ item.title }}</h3>
              <span
                v-if="item.badge"
                class="catalog-card-badge shrink-0 rounded-full border px-2 py-0.5"
                :class="
                  item.badge.variant === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border text-muted-foreground'
                "
              >
                {{ item.badge.text }}
              </span>
            </div>
            <p class="catalog-card-desc mt-2 line-clamp-2 max-h-10 leading-5 text-muted-foreground">
              {{ item.description }}
            </p>
            <div class="mt-auto flex items-center justify-end gap-2 pt-4">
              <span
                v-if="item.typeBadge"
                class="catalog-card-badge mr-auto rounded-full border border-border px-2 py-0.5 text-muted-foreground"
              >
                {{ item.typeBadge }}
              </span>
              <DcButton
                size="sm"
                :variant="isItemEnabled(item) ? 'default' : 'outline'"
                :disabled="isPending(item.id)"
                @click="handleCatalogAction(item)"
              >
                {{ item.actionLabel }}
              </DcButton>
            </div>
          </article>
        </div>
        <div
          v-else
          class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
        >
          {{ t('settings.pluginsHub.emptySearch') }}
        </div>
      </section>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { DcButton } from '@dc-ui/components/button'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import { Input } from '@shadcn/components/ui/input'
import { createOcrClient } from '@api/OcrClient'
import { createPluginClient } from '@api/PluginClient'
import { createRemoteControlClient } from '@api/RemoteControlClient'
import { resolveConnectorManageTarget } from '@jiaorong/plugins/navigation'
import { CUA_PLUGIN_ID, type PluginActionResult, type PluginListItem } from '@shared/types/plugin'
import type { RemoteChannel } from '@shared/types/remote'
import { usePluginCatalogStore } from '@/stores/pluginCatalog'

type CatalogBadge = {
  text: string
  variant: 'success' | 'neutral'
}

type CatalogItemBase = {
  id: string
  title: string
  description: string
  typeBadge?: string
  badge?: CatalogBadge
  icon: string
  iconClass?: string
  actionLabel: string
}

type BuiltinCatalogItem = CatalogItemBase & {
  kind: 'builtin'
}

type OfficialCatalogItem = CatalogItemBase & {
  kind: 'official'
  plugin: PluginListItem
  enabled: boolean
}

type RemoteCatalogItem = CatalogItemBase & {
  kind: 'remote'
  channel: RemoteChannel
  enabled: boolean
}

type ExtensionCatalogItem = OfficialCatalogItem | RemoteCatalogItem
type CatalogItem = BuiltinCatalogItem | ExtensionCatalogItem

type CatalogFilter = 'all' | 'enabled' | 'disabled'

const CATALOG_FILTERS: CatalogFilter[] = ['all', 'enabled', 'disabled']
const FILTER_LABEL_KEYS = {
  all: 'routes.pluginCenterConnectorsAll',
  enabled: 'settings.plugins.status.enabled',
  disabled: 'settings.plugins.status.disabled'
} as const

const remoteIconByChannel: Record<RemoteChannel, string> = {
  telegram: 'lucide:send',
  feishu: 'lucide:message-circle',
  qqbot: 'lucide:bot',
  discord: 'lucide:radio-tower',
  'weixin-ilink': 'lucide:messages-square'
}

const remoteIconClassByChannel: Record<RemoteChannel, string> = {
  telegram: 'text-sky-500',
  feishu: 'text-blue-500',
  qqbot: 'text-emerald-500',
  discord: 'text-indigo-500',
  'weixin-ilink': 'text-green-500'
}
const FEISHU_PLUGIN_ID = 'com.deepchat.plugins.feishu'
const CUA_PLUGIN_ICON = 'lucide:laptop-minimal-check'
const remotePluginId = (channel: RemoteChannel): string => `remote:${channel}`
const isFeishuOfficialPlugin = (plugin: PluginListItem): boolean => plugin.id === FEISHU_PLUGIN_ID
const pluginIcon = (plugin: PluginListItem): string =>
  isFeishuOfficialPlugin(plugin)
    ? remoteIconByChannel.feishu
    : plugin.id === CUA_PLUGIN_ID
      ? CUA_PLUGIN_ICON
      : 'lucide:puzzle'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const ocrClient = createOcrClient()
const pluginClient = createPluginClient()
const remoteControlClient = createRemoteControlClient()
const pluginCatalogStore = usePluginCatalogStore()
const { plugins, remoteChannels, remoteStatuses, ocrStatus, ocrStatusHasError } =
  storeToRefs(pluginCatalogStore)

const loading = ref(false)
const errorMessage = ref('')
const pendingItemId = ref<string | null>(null)
const searchQuery = ref('')
const activeFilter = ref<CatalogFilter>('all')

const isPending = (itemId: string) => pendingItemId.value === itemId
/** 内置能力（如 OCR）没有启用开关，按启用态对待 */
const isItemEnabled = (item: CatalogItem): boolean =>
  item.kind === 'builtin' ? true : item.enabled
const pluginTitle = (plugin: PluginListItem): string =>
  isFeishuOfficialPlugin(plugin) ? t('settings.remote.feishu.title') : plugin.name
const pluginDescription = (plugin: PluginListItem): string => {
  if (isFeishuOfficialPlugin(plugin)) {
    return t('settings.remote.feishu.description')
  }
  return plugin.id === CUA_PLUGIN_ID ? t('settings.pluginsHub.cuaDescription') : plugin.publisher
}
const officialPluginEnabled = (plugin: PluginListItem): boolean =>
  plugin.enabled ||
  (isFeishuOfficialPlugin(plugin) && Boolean(remoteStatuses.value.feishu?.enabled))

const hasFeishuOfficialPlugin = computed(() => plugins.value.some(isFeishuOfficialPlugin))

const catalogItems = computed<CatalogItem[]>(() => {
  const ocrAvailability = ocrStatus.value?.availability
  const ocrItem: BuiltinCatalogItem = {
    id: 'builtin:ocr',
    kind: 'builtin',
    title: t('routes.settings-ocr'),
    description: ocrStatusHasError.value
      ? t('settings.ocr.statusLoadFailed')
      : ocrAvailability?.status === 'unavailable'
        ? t(`settings.ocr.unavailableReasons.${ocrAvailability.reason}`)
        : t('settings.ocr.description'),
    typeBadge: t('settings.pluginsHub.builtinCapability'),
    badge:
      !ocrStatusHasError.value && ocrAvailability
        ? {
            text:
              ocrAvailability.status === 'available'
                ? t('settings.ocr.available')
                : t('settings.ocr.unavailable'),
            variant: ocrAvailability.status === 'available' ? 'success' : 'neutral'
          }
        : undefined,
    icon: 'lucide:scan-text',
    actionLabel: t('settings.pluginsHub.manage')
  }

  const officialItems: OfficialCatalogItem[] = plugins.value.map((plugin) => {
    const enabled = officialPluginEnabled(plugin)
    return {
      id: `official:${plugin.id}`,
      kind: 'official',
      plugin,
      enabled,
      title: pluginTitle(plugin),
      description: pluginDescription(plugin),
      badge: {
        text: enabled
          ? t('settings.plugins.status.enabled')
          : t('settings.plugins.status.disabled'),
        variant: enabled ? 'success' : 'neutral'
      },
      icon: pluginIcon(plugin),
      iconClass: isFeishuOfficialPlugin(plugin) ? remoteIconClassByChannel.feishu : undefined,
      actionLabel: enabled ? t('settings.pluginsHub.manage') : t('settings.pluginsHub.add')
    }
  })

  const remoteItems: RemoteCatalogItem[] = remoteChannels.value
    .filter((channel) => channel.id !== 'feishu' || !hasFeishuOfficialPlugin.value)
    .map((channel) => {
      const status = remoteStatuses.value[channel.id]
      const enabled = Boolean(status?.enabled)
      return {
        id: `remote:${channel.id}`,
        kind: 'remote',
        channel: channel.id,
        enabled,
        title: t(channel.titleKey),
        description: t(channel.descriptionKey),
        badge: {
          text: enabled
            ? t('settings.plugins.status.enabled')
            : t('settings.plugins.status.disabled'),
          variant: enabled ? 'success' : 'neutral'
        },
        icon: remoteIconByChannel[channel.id],
        iconClass: remoteIconClassByChannel[channel.id],
        actionLabel: enabled ? t('settings.pluginsHub.manage') : t('settings.pluginsHub.add')
      }
    })

  const extensionItems: ExtensionCatalogItem[] = [...officialItems, ...remoteItems].sort(
    (left, right) => {
      if (left.enabled === right.enabled) {
        return 0
      }
      return left.enabled ? -1 : 1
    }
  )
  return [ocrItem, ...extensionItems]
})

const filteredItems = computed<CatalogItem[]>(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return catalogItems.value.filter((item) => {
    const enabled = isItemEnabled(item)
    if (activeFilter.value === 'enabled' && !enabled) return false
    if (activeFilter.value === 'disabled' && enabled) return false
    if (!keyword) return true
    return `${item.title} ${item.description}`.toLowerCase().includes(keyword)
  })
})

async function loadCatalog(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const pluginVersion = pluginCatalogStore.capturePluginRefresh()
    const [pluginItems] = await Promise.all([
      pluginClient.listPlugins(),
      loadRemoteCatalog(),
      loadOcrCatalog()
    ])
    pluginCatalogStore.replacePlugins(pluginItems, pluginVersion)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.plugins.loadFailed')
  } finally {
    loading.value = false
  }
}

async function loadRemoteCatalog(): Promise<void> {
  const version = pluginCatalogStore.captureRemoteRefresh()
  try {
    const channels = await remoteControlClient.listRemoteChannels()
    const statuses = await Promise.all(
      channels.map((channel) => remoteControlClient.getChannelStatus(channel.id))
    )
    pluginCatalogStore.replaceRemoteSnapshot(channels, statuses, version)
  } catch (error) {
    console.warn('[PluginsCatalogPage] Failed to load remote channels:', error)
  }
}

async function loadOcrCatalog(): Promise<void> {
  const version = pluginCatalogStore.beginOcrRefresh()
  try {
    const status = await ocrClient.getRuntimeStatus()
    pluginCatalogStore.replaceOcrStatus(status, version)
  } catch (error) {
    pluginCatalogStore.markOcrStatusRefreshFailed(version)
    console.warn('[PluginsCatalogPage] Failed to load OCR status:', error)
  }
}

async function runPluginAction(
  itemId: string,
  plugin: PluginListItem,
  enabled: boolean,
  action: () => Promise<PluginActionResult>
): Promise<void> {
  pendingItemId.value = itemId
  errorMessage.value = ''
  const previous = pluginCatalogStore.beginPluginEnabledMutation(plugin.id, enabled)
  try {
    const result = await action()
    if (!result.ok) {
      throw new Error(result.error || t('settings.plugins.actionFailed'))
    }
    pluginCatalogStore.commitPluginMutation(result.status)
  } catch (error) {
    pluginCatalogStore.rollbackPluginMutation(previous)
    errorMessage.value = error instanceof Error ? error.message : t('settings.plugins.actionFailed')
  } finally {
    pendingItemId.value = null
  }
}

function handleCatalogAction(item: CatalogItem): void {
  if (item.kind === 'builtin') {
    void router.push(resolveConnectorManageTarget('ocr', route))
    return
  }

  if (item.kind === 'official') {
    const plugin = item.plugin
    if (item.enabled || isFeishuOfficialPlugin(plugin)) {
      void router.push(resolveConnectorManageTarget('detail', route, plugin.id))
    } else {
      void runPluginAction(item.id, plugin, true, () => pluginClient.enablePlugin(plugin.id))
    }
    return
  }

  if (item.kind === 'remote') {
    void router.push(resolveConnectorManageTarget('detail', route, remotePluginId(item.channel)))
  }
}

onMounted(() => {
  void loadCatalog()
})
</script>

<style scoped lang="less">
/* 与技能市场保持一致：搜索框 288×36、筛选胶囊 13px/32px 高 */
.catalog-search-input {
  height: 36px;
  padding-left: 36px;
  border-radius: 8px;
  font-size: 13px;
}

.catalog-card {
  min-height: 156px;
}

.catalog-card-desc {
  font-size: 13px;
}

.catalog-card-badge {
  font-size: 11px;
}

.catalog-segment {
  padding: 7px 18px;
  border: none;
  border-radius: 9999px;
  background: #f2f3f5;
  color: #646a73;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: #e8eaed;
    color: #1f2329;
  }

  &.is-active {
    background: #006eff;
    color: #ffffff;

    &:hover {
      background: #006eff;
    }
  }
}
</style>
