<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { DcEmpty } from '@dc-ui/components/empty'
import { DcButton } from '@dc-ui/components/button'
import { Spinner } from '@shadcn/components/ui/spinner'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from '@shadcn/components/ui/dialog'
import { Input } from '@shadcn/components/ui/input'
import { DcCopyButton } from '@dc-ui/components'
import { DcSheetPanel } from '@dc-ui/components/sheet-panel'
import { DcStatusPill } from '@dc-ui/components/status-pill'
import { useMcpStore } from '@/stores/mcp'
import { useI18n } from 'vue-i18n'
import { notifyRenderer } from '@renderer-notifications/rendererNotificationPort'
import { useRouter } from 'vue-router'
import McpServerCard from './McpServerCard.vue'
import McpEnterpriseProfiles from './McpEnterpriseProfiles.vue'
import McpServerForm from '../McpServerForm.vue'
import McpToolPanel from './McpToolPanel.vue'
import McpPromptPanel from './McpPromptPanel.vue'
import McpResourceViewer from './McpResourceViewer.vue'
import type { MCPServerConfig, McpCredentialBinding, McpCredentialInput } from '@shared/types/mcp'
import { createMcpClient } from '@api/McpClient'
import { createSettingsClient } from '@api/SettingsClient'
import {
  getJiaorongPluginMcpServer,
  resolveJiaorongMcpServerListName as resolveMcpServerListName
} from '@jiaorong/plugins/mcp'
import { canEnableOpenPlatformConnector } from '@jiaorong/plugins/market/openPlatformMarket'
import { isOpenPlatformConnectorConfig } from '@jiaorong/plugins/market/openPlatformConnectorInstall'

const mcpStore = useMcpStore()
const { t } = useI18n()
const router = useRouter()
const settingsClient = createSettingsClient()
const mcpClient = createMcpClient()
const props = withDefaults(
  defineProps<{
    showFooterAddButton?: boolean
    serverEnabledOverrides?: Record<string, boolean>
    serverLoadingOverrides?: Record<string, boolean>
    agentScopedToggle?: boolean
    agentScopedBusy?: boolean
  }>(),
  {
    showFooterAddButton: true,
    serverEnabledOverrides: () => ({}),
    serverLoadingOverrides: () => ({}),
    agentScopedToggle: false,
    agentScopedBusy: false
  }
)

const emit = defineEmits<{
  'toggle-agent-server': [serverName: string, enabled: boolean]
}>()

type McpServerFormStep = 'simple' | 'detailed'

const isAddServerDialogOpen = defineModel<boolean>('addOpen', { default: false })
const isEditServerDialogOpen = ref(false)
const isRemoveConfirmDialogOpen = ref(false)
const isAuthCallbackDialogOpen = ref(false)
const addServerError = ref<'duplicate' | 'failed' | null>(null)
const isAddingServer = ref(false)
const addServerFormStep = ref<McpServerFormStep>('simple')
const serverDialogBaseStyle = {
  '--primary': '#006eff',
  '--ring': '#006eff',
  maxWidth: 'calc(100vw - 64px)',
  maxHeight: 'calc(100vh - 48px)'
}
const addServerDialogStyle = computed(() => ({
  ...serverDialogBaseStyle,
  width: addServerFormStep.value === 'simple' ? '680px' : '760px',
  height: addServerFormStep.value === 'simple' ? '640px' : '760px',
  minWidth:
    addServerFormStep.value === 'simple'
      ? 'min(680px, calc(100vw - 64px))'
      : 'min(760px, calc(100vw - 64px))'
}))
const editServerDialogStyle = {
  ...serverDialogBaseStyle,
  width: '760px',
  height: '760px',
  minWidth: 'min(760px, calc(100vw - 64px))'
}
const editServerError = ref<string | null>(null)
const isEditingServer = ref(false)
const removeServerError = ref<string | null>(null)
const isRemovingServer = ref(false)
const isToolPanelOpen = ref(false)
const isPromptPanelOpen = ref(false)
const isResourceViewerOpen = ref(false)
const isDiagnosticsOpen = ref(false)
const diagnosticsServerName = ref('')
const diagnostics = ref<Awaited<ReturnType<typeof mcpClient.getServerDiagnostics>> | null>(null)
const diagnosticsError = ref('')
const isDiagnosticsLoading = ref(false)
const selectedServer = ref<string>('')
const selectedServerForTools = ref<string>('')
const selectedServerForPrompts = ref<string>('')
const selectedServerForResources = ref<string>('')
const selectedDetailServerName = ref('')
const selectedServerForAuth = ref('')
const authCallbackUrl = ref('')
const authCallbackError = ref<string | null>(null)
const isSubmittingAuthCallback = ref(false)
const searchQuery = ref('')
const activeFilter = ref<'all' | 'running' | 'stopped'>('all')
const MCP_FILTERS = ['all', 'running', 'stopped'] as const
let addServerDialogGeneration = 0
let editServerDialogGeneration = 0
let diagnosticsRequestGeneration = 0

watch(
  () => mcpStore.mcpInstallCache,
  (newCache) => {
    if (newCache) {
      isAddServerDialogOpen.value = true
    }
  },
  { immediate: true }
)

watch(
  isAddServerDialogOpen,
  (newIsAddServerDialogOpen) => {
    addServerDialogGeneration += 1
    if (!newIsAddServerDialogOpen) {
      mcpStore.clearMcpInstallCache()
      addServerError.value = null
      addServerFormStep.value = 'simple'
    }
  },
  { flush: 'sync' }
)

watch(
  isEditServerDialogOpen,
  (open) => {
    editServerDialogGeneration += 1
    if (!open) {
      editServerError.value = null
      selectedServer.value = ''
    }
  },
  { flush: 'sync' }
)

watch(authCallbackUrl, () => {
  authCallbackError.value = null
})
const isDeepChatManagedServer = (config?: MCPServerConfig) => {
  return config?.source === 'deepchat'
}

/** 市场里尚未落地为本地配置的开放平台连接器；落地后与普通自定义服务器一致。 */
const isOpenPlatformRemoteOnly = (server: { name: string; source?: string }) =>
  isOpenPlatformConnectorConfig(server) && !mcpStore.config.mcpServers[server.name]

/** 正在写入本地配置的连接器名称，用于补齐这段窗口期的开关 loading 反馈。 */
const installingConnectorNames = ref<string[]>([])

const isInstallingConnector = (serverName: string) =>
  installingConnectorNames.value.includes(serverName)

/** 正在同步开放平台新版本的连接器名称，驱动更新按钮的 loading 态。 */
const updatingConnectorNames = ref<string[]>([])

const isUpdatingConnector = (serverName: string) =>
  updatingConnectorNames.value.includes(serverName)

const isBuiltInServer = (serverName: string) => {
  const config = mcpStore.config.mcpServers[serverName]
  return (
    config?.type === 'inmemory' ||
    isDeepChatManagedServer(config) ||
    Boolean(getJiaorongPluginMcpServer(serverName))
  )
}

const localizedServerListName = (serverName: string) =>
  t(`mcp.inmemory.${serverName}.name`, resolveMcpServerListName(serverName))

const localizedServerDescription = (serverName: string, fallback = '') =>
  t(`mcp.inmemory.${serverName}.desc`, fallback)

const filteredServers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return mcpStore.serverList.filter((server) => {
    const matchesQuery =
      !query ||
      server.name.toLowerCase().includes(query) ||
      localizedServerListName(server.name).toLowerCase().includes(query) ||
      server.descriptions?.toLowerCase().includes(query)
    const matchesFilter =
      activeFilter.value === 'all' ||
      (activeFilter.value === 'running' && server.isRunning) ||
      (activeFilter.value === 'stopped' && !server.isRunning)

    return matchesQuery && matchesFilter
  })
})

const selectedDetailServer = computed(() =>
  mcpStore.serverList.find((server) => server.name === selectedDetailServerName.value)
)

const getServerToolsCount = (serverName: string) => {
  return mcpStore.visibleTools.filter((tool) => tool.server.name === serverName).length
}

const getServerPromptsCount = (serverName: string) => {
  return mcpStore.visiblePrompts.filter((prompt) => prompt.client.name === serverName).length
}

const getServerResourcesCount = (serverName: string) => {
  return mcpStore.visibleResources.filter((resource) => resource.client.name === serverName).length
}

const getServerEnabled = (serverName: string, fallback: boolean) =>
  props.serverEnabledOverrides[serverName] ?? fallback

const enableOpenPlatformConnector = async (
  server: MCPServerConfig & { name: string }
): Promise<void> => {
  if (!canEnableOpenPlatformConnector(server)) {
    notifyRenderer({
      kind: 'info',
      code: 'settings.mcp.openPlatformConnectorUnavailable',
      title: t('settings.mcp.openPlatformConnectorUnavailable'),
      description: t('settings.mcp.openPlatformConnectorUnavailableDesc')
    })
    return
  }

  // 写入本地配置前该服务器还不存在，store 的 loading 状态覆盖不到这段窗口期。
  installingConnectorNames.value = [...installingConnectorNames.value, server.name]
  try {
    const result = await mcpStore.installOpenPlatformConnector(server)
    if (result.status === 'started') return

    if (result.status === 'unsupported') {
      notifyRenderer({
        kind: 'error',
        code: 'settings.mcp.openPlatformConnectorUnavailable',
        title: t('settings.mcp.openPlatformConnectorUnavailable'),
        description: t('settings.mcp.openPlatformConnectorUnavailableDesc')
      })
      return
    }

    notifyRenderer({
      kind: 'error',
      code: 'settings.mcp.openPlatformConnectorInstallFailed',
      title: t('settings.mcp.openPlatformConnectorInstallFailed'),
      description:
        mcpStore.serverStatusMessages?.[result.serverName]?.trim() ||
        t('settings.mcp.serverStartFailedDesc')
    })
  } catch (error) {
    console.error('[MCP] Failed to enable open platform connector', server.name, error)
    notifyRenderer({
      kind: 'error',
      code: 'settings.mcp.openPlatformConnectorInstallFailed',
      title: t('settings.mcp.openPlatformConnectorInstallFailed'),
      description: t('settings.mcp.serverStartFailedDesc')
    })
  } finally {
    installingConnectorNames.value = installingConnectorNames.value.filter(
      (serverName) => serverName !== server.name
    )
  }
}

const handleUpdateConnector = async (serverName: string): Promise<void> => {
  if (isUpdatingConnector(serverName)) return
  updatingConnectorNames.value = [...updatingConnectorNames.value, serverName]
  try {
    // 成功 / 失败通知由 store 统一发出，这里只维护按钮 loading。
    await mcpStore.updateOpenPlatformConnector(serverName)
  } finally {
    updatingConnectorNames.value = updatingConnectorNames.value.filter(
      (name) => name !== serverName
    )
  }
}

const saveSubmittedCredential = async (
  serverName: string,
  credential?: McpCredentialInput
): Promise<void> => {
  if (!credential) return
  const servers = await mcpClient.getMcpServers()
  const config = servers[serverName]
  if (!config?.serverId || !config.configGeneration || !config.bindingHash || !config.baseUrl) {
    throw new Error('MCP server credential binding is unavailable')
  }
  const binding: McpCredentialBinding = {
    serverId: config.serverId,
    configGeneration: config.configGeneration,
    bindingHash: config.bindingHash,
    endpoint: config.baseUrl,
    protectedResourceUrl: config.authorization?.protectedResourceUrl,
    authorizationServerIssuer: config.authorization?.authorizationServerIssuer,
    clientId: config.authorization?.clientId
  }
  await mcpClient.setCredential(binding, credential)
}

const handleAddServer = async (
  serverName: string,
  serverConfig: MCPServerConfig,
  credential?: McpCredentialInput
) => {
  if (isAddingServer.value) return

  isAddingServer.value = true
  addServerError.value = null
  const dialogGeneration = addServerDialogGeneration
  try {
    const result = await mcpStore.addServer(serverName, serverConfig)
    if (dialogGeneration !== addServerDialogGeneration || !isAddServerDialogOpen.value) {
      return
    }
    if (result.status === 'added') {
      try {
        await saveSubmittedCredential(serverName, credential)
      } catch (error) {
        console.error('[McpServers] Failed to save server credential:', serverName, error)
        notifyRenderer({
          kind: 'error',
          code: 'settings.mcp.serverForm.credentialSaveError',
          title: t('settings.mcp.serverForm.credentialSaveError'),
          description: t('settings.mcp.serverForm.credentialSaveError')
        })
      }
      if (dialogGeneration !== addServerDialogGeneration || !isAddServerDialogOpen.value) {
        return
      }
      isAddServerDialogOpen.value = false
      return
    }
    addServerError.value = result.status
  } finally {
    isAddingServer.value = false
  }
}

const clearAddServerError = () => {
  addServerError.value = null
}

const clearFailedAddServerError = () => {
  if (addServerError.value === 'failed') {
    addServerError.value = null
  }
}

const clearEditServerError = () => {
  editServerError.value = null
}

const openAddServerDialog = () => {
  isAddServerDialogOpen.value = true
}

const handleAddDialogOpenChange = (open: boolean) => {
  if (!open && isAddingServer.value) return
  isAddServerDialogOpen.value = open
}

const closeAuthCallbackDialog = () => {
  isAuthCallbackDialogOpen.value = false
  selectedServerForAuth.value = ''
  authCallbackUrl.value = ''
  authCallbackError.value = null
}

const refreshSelectedServerAuthStatus = async () => {
  const serverName = selectedServerForAuth.value
  if (!isAuthCallbackDialogOpen.value || !serverName) {
    return
  }

  const status = await mcpStore.updateServerAuthStatus(serverName, true)
  if (status?.authenticated) {
    closeAuthCallbackDialog()
  }
}

useEventListener(window, 'focus', refreshSelectedServerAuthStatus)

const handleEditServer = async (
  serverName: string,
  serverConfig: Partial<MCPServerConfig>,
  credential?: McpCredentialInput
) => {
  if (isEditingServer.value) return

  isEditingServer.value = true
  editServerError.value = null
  const dialogGeneration = editServerDialogGeneration
  let success = false
  try {
    success = await mcpStore.updateServer(serverName, serverConfig)
  } catch (error) {
    console.error('[McpServers] Failed to update server:', serverName, error)
  }
  if (
    dialogGeneration !== editServerDialogGeneration ||
    !isEditServerDialogOpen.value ||
    selectedServer.value !== serverName
  ) {
    isEditingServer.value = false
    return
  }

  if (!success) {
    isEditingServer.value = false
    editServerError.value = t('common.error.requestFailed')
    return
  }

  try {
    await saveSubmittedCredential(serverName, credential)
  } catch (error) {
    console.error('[McpServers] Failed to save server credential:', serverName, error)
    isEditingServer.value = false
    editServerError.value = t('settings.mcp.serverForm.credentialSaveError')
    return
  }

  if (
    dialogGeneration !== editServerDialogGeneration ||
    !isEditServerDialogOpen.value ||
    selectedServer.value !== serverName
  ) {
    isEditingServer.value = false
    return
  }

  isEditingServer.value = false
  isEditServerDialogOpen.value = false
}

const handleRemoveServer = async (serverName: string) => {
  const config = mcpStore.config.mcpServers[serverName]
  if (config?.type === 'inmemory' || isDeepChatManagedServer(config)) {
    return
  }
  removeServerError.value = null
  selectedServer.value = serverName
  isRemoveConfirmDialogOpen.value = true
}

const confirmRemoveServer = async () => {
  if (isRemovingServer.value) return

  const serverName = selectedServer.value
  isRemoveConfirmDialogOpen.value = false
  isRemovingServer.value = true
  removeServerError.value = null
  let success = false
  try {
    success = await mcpStore.removeServer(serverName)
  } catch (error) {
    console.error('[McpServers] Failed to remove server:', serverName, error)
  }
  isRemovingServer.value = false

  if (!success) {
    removeServerError.value = t('common.error.requestFailed')
    isRemoveConfirmDialogOpen.value = true
  }
}

const handleToggleServer = async (serverName: string) => {
  if (
    mcpStore.serverLoadingStates[serverName] ||
    isInstallingConnector(serverName) ||
    props.agentScopedBusy
  ) {
    return
  }

  if (props.agentScopedToggle) {
    const server = mcpStore.serverList.find((item) => item.name === serverName)
    emit('toggle-agent-server', serverName, !getServerEnabled(serverName, Boolean(server?.enabled)))
    return
  }

  const remoteConnector = mcpStore.serverList.find(
    (item) => item.name === serverName && isOpenPlatformRemoteOnly(item)
  )
  if (remoteConnector) {
    await enableOpenPlatformConnector(remoteConnector)
    return
  }

  const config = mcpStore.config.mcpServers[serverName]
  if (isDeepChatManagedServer(config)) {
    notifyRenderer({
      kind: 'info',
      code: 'settings.mcp.managedServerReadOnly',
      title: t('settings.mcp.managedServerReadOnly'),
      description: t('settings.mcp.managedServerReadOnlyDesc')
    })
    return
  }

  const success = await mcpStore.toggleServer(serverName)
  if (!success) {
    notifyRenderer({
      kind: 'error',
      code: 'settings.mcp.toggleFailed',
      title: t('common.error.operationFailed'),
      description:
        mcpStore.serverStatusMessages?.[serverName]?.trim() ||
        t('settings.mcp.serverStartFailedDesc')
    })
  }
}

const handleAuthenticateServer = async (serverName: string) => {
  const status = await mcpStore.startServerAuth(serverName)
  if (!status) {
    notifyRenderer({
      kind: 'error',
      code: 'settings.mcp.authStartFailed',
      title: t('settings.mcp.authFailed'),
      description: t('common.error.requestFailed')
    })
    return
  }

  if (status.authenticated) {
    closeAuthCallbackDialog()
    return
  }

  selectedServerForAuth.value = serverName
  authCallbackUrl.value = ''
  authCallbackError.value = null
  isAuthCallbackDialogOpen.value = true
}

const submitAuthCallbackUrl = async () => {
  if (isSubmittingAuthCallback.value) {
    return
  }

  const serverName = selectedServerForAuth.value
  const callbackUrl = authCallbackUrl.value.trim()
  if (!serverName || !callbackUrl) {
    return
  }

  isSubmittingAuthCallback.value = true
  try {
    const status = await mcpStore.completeServerAuthFromCallbackUrl(serverName, callbackUrl)
    if (status?.authenticated) {
      closeAuthCallbackDialog()
      return
    }

    authCallbackError.value = status?.error || t('common.error.requestFailed')
  } finally {
    isSubmittingAuthCallback.value = false
  }
}

const openEditServerDialog = (serverName: string) => {
  const specialServers = {
    difyKnowledge: 'dify',
    ragflowKnowledge: 'ragflow',
    fastGptKnowledge: 'fastgpt',
    builtinKnowledge: 'builtinKnowledge'
  }

  if (specialServers[serverName]) {
    const subtab = specialServers[serverName]
    if (router.hasRoute('settings-knowledge-base')) {
      void router.push({
        name: 'settings-knowledge-base',
        query: { subtab }
      })
      return
    }
    void settingsClient.openSettings({
      routeName: 'settings-knowledge-base',
      section: subtab
    })
    return
  }

  const config = mcpStore.config.mcpServers[serverName]
  if (isDeepChatManagedServer(config)) {
    notifyRenderer({
      kind: 'info',
      code: 'settings.mcp.managedServerReadOnly',
      title: t('settings.mcp.managedServerReadOnly'),
      description: t('settings.mcp.managedServerReadOnlyDesc')
    })
    return
  }

  selectedServer.value = serverName
  editServerError.value = null
  isEditServerDialogOpen.value = true
}

const handleEditDialogOpenChange = (open: boolean) => {
  if (!open && isEditingServer.value) return
  isEditServerDialogOpen.value = open
}

const handleRemoveDialogOpenChange = (open: boolean) => {
  if (!open && isRemovingServer.value) return
  isRemoveConfirmDialogOpen.value = open
  if (!open) removeServerError.value = null
}

const handleAuthDialogOpenChange = (open: boolean) => {
  if (!open && isSubmittingAuthCallback.value) return
  if (open) {
    isAuthCallbackDialogOpen.value = true
  } else {
    closeAuthCallbackDialog()
  }
}

const handleViewTools = async (serverName: string) => {
  selectedServerForTools.value = serverName
  await mcpStore.loadTools()
  isToolPanelOpen.value = true
}

const handleViewPrompts = async (serverName: string) => {
  selectedServerForPrompts.value = serverName
  await mcpStore.loadPrompts()
  isPromptPanelOpen.value = true
}

const handleViewResources = async (serverName: string) => {
  selectedServerForResources.value = serverName
  await mcpStore.loadResources()
  isResourceViewerOpen.value = true
}

const refreshDiagnostics = async () => {
  if (!diagnosticsServerName.value) {
    return
  }
  const serverName = diagnosticsServerName.value
  const requestGeneration = ++diagnosticsRequestGeneration
  isDiagnosticsLoading.value = true
  diagnosticsError.value = ''
  diagnostics.value = null
  try {
    const nextDiagnostics = await mcpClient.getServerDiagnostics(serverName)
    if (
      requestGeneration === diagnosticsRequestGeneration &&
      serverName === diagnosticsServerName.value
    ) {
      diagnostics.value = nextDiagnostics
    }
  } catch (error) {
    if (
      requestGeneration === diagnosticsRequestGeneration &&
      serverName === diagnosticsServerName.value
    ) {
      diagnostics.value = null
      diagnosticsError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (requestGeneration === diagnosticsRequestGeneration) {
      isDiagnosticsLoading.value = false
    }
  }
}

const openDiagnostics = (serverName: string) => {
  diagnosticsServerName.value = serverName
  isDiagnosticsOpen.value = true
  void refreshDiagnostics()
}

const diagnosticsText = computed(() =>
  diagnostics.value ? JSON.stringify(diagnostics.value, null, 2) : ''
)

watch(
  () =>
    [
      diagnosticsServerName.value,
      mcpStore.serverList.find((server) => server.name === diagnosticsServerName.value)?.isRunning
    ] as const,
  ([serverName, isRunning], [previousServerName, wasRunning]) => {
    if (isDiagnosticsOpen.value && serverName === previousServerName && isRunning !== wasRunning) {
      void refreshDiagnostics()
    }
  }
)

const openDetail = (serverName: string) => {
  selectedDetailServerName.value = serverName
}

const closeDetail = (open: boolean) => {
  if (!open) {
    selectedDetailServerName.value = ''
  }
}

defineExpose({
  openAddServerDialog
})
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <!-- Server list -->
    <ScrollArea class="min-h-0 flex-1 px-8">
      <div v-if="mcpStore.configLoading" class="flex justify-center py-8">
        <div class="text-center">
          <Spinner class="mx-auto mb-2 size-6 text-muted-foreground" />
          <p class="text-xs text-muted-foreground">{{ t('common.loading') }}</p>
        </div>
      </div>

      <DcEmpty
        v-else-if="mcpStore.serverList.length === 0"
        icon="lucide:server-off"
        :title="t('settings.mcp.noServersFound')"
        :description="t('settings.mcp.noServersDescription')"
        class="border-0 py-8"
      />

      <div v-else class="flex flex-col gap-6 pt-6 pb-8">
        <div class="grid items-center gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          <div class="relative w-full min-w-0">
            <Icon
              icon="lucide:search"
              class="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="searchQuery"
              class="h-9 w-full rounded bg-background pl-9"
              :placeholder="t('settings.mcp.center.searchPlaceholder')"
            />
          </div>
          <div
            class="flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:col-span-1 lg:col-span-2"
          >
            <DcButton
              v-for="filter in MCP_FILTERS"
              :key="filter"
              size="sm"
              :variant="activeFilter === filter ? 'default' : 'ghost'"
              class="h-8 rounded-full px-0 text-[13px] leading-[18px] font-normal shadow-none active:scale-100"
              :class="[
                filter === 'all' ? 'w-[62px]' : 'w-[75px]',
                activeFilter === filter
                  ? 'text-white hover:text-white'
                  : 'bg-[#F1F5FA] text-[#5C78A0] hover:bg-[#F1F5FA] hover:text-[#5C78A0]'
              ]"
              @click="activeFilter = filter"
            >
              {{ t(`settings.mcp.center.filters.${filter}`) }}
            </DcButton>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <McpServerCard
            v-for="server in filteredServers"
            :key="server.name"
            :server="{
              ...server,
              enabled: getServerEnabled(server.name, Boolean(server.enabled))
            }"
            :is-built-in="isBuiltInServer(server.name)"
            :is-managed="
              mcpStore.config.mcpServers[server.name]?.source === 'deepchat' ||
              isOpenPlatformRemoteOnly(server)
            "
            :is-loading="
              mcpStore.serverLoadingStates[server.name] ||
              props.serverLoadingOverrides[server.name] ||
              isInstallingConnector(server.name)
            "
            :disabled="
              mcpStore.configLoading ||
              (props.agentScopedToggle &&
                (props.agentScopedBusy || isOpenPlatformRemoteOnly(server)))
            "
            :tools-count="getServerToolsCount(server.name)"
            :prompts-count="getServerPromptsCount(server.name)"
            :resources-count="getServerResourcesCount(server.name)"
            :update-available="Boolean(mcpStore.connectorUpdatesAvailable[server.name])"
            :is-updating="isUpdatingConnector(server.name)"
            @click="openDetail(server.name)"
            @toggle="handleToggleServer(server.name)"
            @edit="openEditServerDialog(server.name)"
            @remove="handleRemoveServer(server.name)"
            @view-tools="handleViewTools(server.name)"
            @view-prompts="handleViewPrompts(server.name)"
            @view-resources="handleViewResources(server.name)"
            @authenticate="handleAuthenticateServer(server.name)"
            @diagnostics="openDiagnostics(server.name)"
            @update="handleUpdateConnector(server.name)"
          />
        </div>

        <div
          v-if="filteredServers.length === 0"
          class="py-8 text-center text-sm text-muted-foreground"
        >
          {{ t('settings.mcp.center.noResults') }}
        </div>
      </div>
    </ScrollArea>

    <!-- Footer actions -->
    <div v-if="showFooterAddButton" class="shrink-0 border-t bg-background">
      <div class="flex items-center justify-between gap-3 px-8 py-3">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <slot name="status-bar">
            <div data-mcp-server-counts class="flex items-center space-x-3">
              <div class="flex items-center space-x-1">
                <Icon icon="lucide:server" class="h-3 w-3 text-muted-foreground" />
                <span class="text-xs text-muted-foreground">
                  {{ t('settings.mcp.totalServers') }}: {{ mcpStore.serverList.length }}
                </span>
              </div>
              <div v-if="mcpStore.serverList.length > 0" class="flex items-center space-x-1">
                <Icon icon="lucide:play" class="h-3 w-3 text-green-600" />
                <span class="text-xs text-green-600">
                  {{ mcpStore.serverList.filter((s) => s.isRunning).length }}
                </span>
              </div>
            </div>
          </slot>
        </div>

        <!-- Action buttons -->
        <div class="flex space-x-2">
          <span v-if="!props.agentScopedToggle" data-mcp-enterprise-identity>
            <McpEnterpriseProfiles />
          </span>
          <slot name="footer-actions-after" />
        </div>
      </div>
    </div>

    <Dialog :open="isAddServerDialogOpen" @update:open="handleAddDialogOpenChange">
      <DialogTrigger v-if="props.showFooterAddButton" as-child>
        <DcButton size="sm" class="h-8 px-3 text-xs">
          <Icon icon="lucide:plus" class="mr-1.5 h-3 w-3" />
          {{ t('common.add') }}
        </DcButton>
      </DialogTrigger>
      <DialogContent
        class="mcp-add-server-dialog flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl p-0"
        :style="addServerDialogStyle"
      >
        <DialogHeader class="shrink-0 gap-1 border-b border-[#edf0f4] px-6 py-4">
          <DialogTitle class="text-base font-semibold">{{
            t('settings.mcp.addServerDialog.title')
          }}</DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            {{ t('settings.mcp.addServerDialog.description') }}
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          :default-json-config="mcpStore.mcpInstallCache || undefined"
          :submitting="isAddingServer"
          :name-error="
            addServerError === 'duplicate' ? t('settings.mcp.serverForm.nameDuplicate') : undefined
          "
          :submission-error="
            addServerError === 'failed' ? t('mcp.errors.addServerFailed') : undefined
          "
          @submit="handleAddServer"
          @input-change="clearFailedAddServerError"
          @name-change="clearAddServerError"
          @step-change="addServerFormStep = $event"
          @cancel="handleAddDialogOpenChange(false)"
        />
      </DialogContent>
    </Dialog>

    <DcSheetPanel
      appearance="plain"
      :open="Boolean(selectedDetailServer)"
      :title="selectedDetailServer ? localizedServerListName(selectedDetailServer.name) : ''"
      :description="
        selectedDetailServer
          ? localizedServerDescription(selectedDetailServer.name, selectedDetailServer.descriptions)
          : ''
      "
      @update:open="closeDetail"
    >
      <div v-if="selectedDetailServer" class="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <div class="flex flex-wrap gap-2">
          <DcStatusPill
            :status="selectedDetailServer.isRunning ? 'running' : 'stopped'"
            :label="
              selectedDetailServer.isRunning ? t('settings.mcp.running') : t('settings.mcp.stopped')
            "
            class="h-[26px] w-20 justify-center rounded-lg border-0 px-0"
            :class="
              selectedDetailServer.isRunning
                ? 'bg-[#F0FFF3] text-[#33B737] [&_span]:bg-[#33B737]'
                : 'bg-[#F1F5FA] text-[#86909C] [&_span]:bg-[#86909C]'
            "
          />
          <DcStatusPill
            status="neutral"
            :label="
              isBuiltInServer(selectedDetailServer.name)
                ? t('settings.mcp.builtInServers')
                : t('settings.mcp.customServers')
            "
            class="h-[26px] w-[94px] justify-center rounded-lg border-0 bg-[#F1F5FA] px-0 text-[#5C78A0] [&_span]:bg-[#86909C]"
          />
        </div>

        <div class="grid grid-cols-3 gap-2">
          <DcButton
            variant="outline"
            class="h-[52px] min-w-0 cursor-pointer rounded-lg border-[#D5E0ED] bg-[#F7FAFE] shadow-none hover:bg-[#F7FAFE] disabled:border-[#D5E0ED] disabled:bg-[#F7FAFE] disabled:text-muted-foreground disabled:opacity-100 text-[#1C324D]"
            :disabled="getServerToolsCount(selectedDetailServer.name) === 0"
            @click="handleViewTools(selectedDetailServer.name)"
          >
            <Icon icon="lucide:wrench" class="size-4 text-[#5C78A0]" />
            {{ getServerToolsCount(selectedDetailServer.name) }}
          </DcButton>
          <DcButton
            variant="outline"
            class="h-[52px] min-w-0 cursor-pointer rounded-lg border-[#D5E0ED] bg-[#F7FAFE] shadow-none hover:bg-[#F7FAFE] disabled:border-[#D5E0ED] disabled:bg-[#F7FAFE] disabled:text-muted-foreground disabled:opacity-100 text-[#1C324D]"
            :disabled="getServerPromptsCount(selectedDetailServer.name) === 0"
            @click="handleViewPrompts(selectedDetailServer.name)"
          >
            <Icon icon="lucide:message-square-quote" class="size-4 text-[#5C78A0]" />
            {{ getServerPromptsCount(selectedDetailServer.name) }}
          </DcButton>
          <DcButton
            variant="outline"
            class="h-[52px] min-w-0 cursor-pointer rounded-lg border-[#D5E0ED] bg-[#F7FAFE] shadow-none hover:bg-[#F7FAFE] disabled:border-[#D5E0ED] disabled:bg-[#F7FAFE] disabled:text-muted-foreground disabled:opacity-100 text-[#1C324D]"
            :disabled="getServerResourcesCount(selectedDetailServer.name) === 0"
            @click="handleViewResources(selectedDetailServer.name)"
          >
            <Icon icon="lucide:folder" class="size-4 text-[#5C78A0]" />
            {{ getServerResourcesCount(selectedDetailServer.name) }}
          </DcButton>
        </div>

        <div
          v-if="selectedDetailServer.baseUrl"
          class="h-[52px] max-w-full overflow-hidden rounded-lg border border-[#D5E0ED] bg-[#F7FAFE] px-3 py-2"
          data-testid="mcp-server-detail-url"
        >
          <div class="text-xs font-medium text-muted-foreground">
            {{ t('settings.mcp.serverForm.baseUrl') }}
          </div>
          <div class="mt-0.5 truncate font-mono text-xs" :title="selectedDetailServer.baseUrl">
            {{ selectedDetailServer.baseUrl }}
          </div>
        </div>

        <div
          v-else
          class="h-[52px] max-w-full overflow-hidden rounded-lg border border-[#D5E0ED] bg-[#F7FAFE] px-3 py-2"
        >
          <div class="text-xs font-medium text-muted-foreground">
            {{ t('settings.mcp.center.command') }}
          </div>
          <div
            class="mt-0.5 truncate font-mono text-xs"
            :title="selectedDetailServer.command || '-'"
          >
            {{ selectedDetailServer.command || '-' }}
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <DcButton
            v-if="mcpStore.config.mcpServers[selectedDetailServer.name]"
            variant="outline"
            icon="lucide:pen-line"
            icon-class="text-[#5C78A0]"
            class="text-[#1C324D] hover:text-[#1C324D]"
            style="padding: 8px 21px"
            @click="openEditServerDialog(selectedDetailServer.name)"
          >
            {{ t('settings.mcp.editServer') }}
          </DcButton>
          <DcButton
            v-if="
              !isBuiltInServer(selectedDetailServer.name) &&
              mcpStore.config.mcpServers[selectedDetailServer.name]
            "
            variant="destructive"
            icon="lucide:trash-2"
            @click="handleRemoveServer(selectedDetailServer.name)"
          >
            {{ t('settings.mcp.removeServer') }}
          </DcButton>
        </div>
      </div>
    </DcSheetPanel>

    <!-- Edit server dialog -->
    <Dialog :open="isEditServerDialogOpen" @update:open="handleEditDialogOpenChange">
      <DialogContent
        class="edit-server-dialog flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl p-0"
        :style="editServerDialogStyle"
      >
        <DialogHeader class="shrink-0 gap-1 border-b border-[#edf0f4] px-6 py-4">
          <DialogTitle class="text-base font-semibold">{{
            t('settings.mcp.editServerDialog.title')
          }}</DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            {{ t('settings.mcp.editServerDialog.description') }}
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          v-if="selectedServer && mcpStore.config.mcpServers[selectedServer]"
          :server-name="selectedServer"
          :initial-config="mcpStore.config.mcpServers[selectedServer]"
          :edit-mode="true"
          :submitting="isEditingServer"
          :submission-error="editServerError || undefined"
          @submit="handleEditServer"
          @input-change="clearEditServerError"
          @cancel="handleEditDialogOpenChange(false)"
        />
      </DialogContent>
    </Dialog>

    <!-- Remove server confirmation dialog -->
    <Dialog :open="isRemoveConfirmDialogOpen" @update:open="handleRemoveDialogOpenChange">
      <DialogContent class="w-[90vw] max-w-[380px]">
        <DialogHeader>
          <DialogTitle class="text-base">{{
            t('settings.mcp.removeServerDialog.title')
          }}</DialogTitle>
          <DialogDescription class="text-sm">
            {{ t('settings.mcp.confirmRemoveServer', { name: selectedServer }) }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="removeServerError" role="alert" class="text-sm text-destructive">
          {{ removeServerError }}
        </p>
        <div class="mt-2 flex flex-row items-center justify-end gap-3">
          <DcButton
            variant="outline"
            size="sm"
            class="min-w-24"
            :disabled="isRemovingServer"
            @click="isRemoveConfirmDialogOpen = false"
          >
            {{ t('common.cancel') }}
          </DcButton>
          <DcButton
            variant="destructive"
            size="sm"
            class="min-w-24"
            :disabled="isRemovingServer"
            @click="confirmRemoveServer"
          >
            <Spinner v-if="isRemovingServer" data-icon="inline-start" />
            {{ t('common.confirm') }}
          </DcButton>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog :open="isAuthCallbackDialogOpen" @update:open="handleAuthDialogOpenChange">
      <DialogContent class="w-[90vw] max-w-[460px]">
        <DialogHeader>
          <DialogTitle class="text-base">{{ t('settings.mcp.authCallbackTitle') }}</DialogTitle>
          <DialogDescription class="text-sm">
            {{ t('settings.mcp.authCallbackDescription') }}
          </DialogDescription>
        </DialogHeader>
        <div class="mt-2 flex flex-col gap-3">
          <Input
            v-model="authCallbackUrl"
            :placeholder="t('settings.mcp.authCallbackPlaceholder')"
            :disabled="isSubmittingAuthCallback"
            :aria-invalid="Boolean(authCallbackError)"
            :aria-describedby="authCallbackError ? 'mcp-auth-callback-error' : undefined"
            @keydown.enter.prevent="submitAuthCallbackUrl"
          />
          <p
            v-if="authCallbackError"
            id="mcp-auth-callback-error"
            role="alert"
            class="text-sm text-destructive"
          >
            {{ authCallbackError }}
          </p>
          <div class="flex justify-end gap-2">
            <DcButton
              variant="outline"
              size="sm"
              :disabled="isSubmittingAuthCallback"
              @click="closeAuthCallbackDialog"
            >
              {{ t('common.cancel') }}
            </DcButton>
            <DcButton
              size="sm"
              :disabled="!authCallbackUrl.trim() || isSubmittingAuthCallback"
              @click="submitAuthCallbackUrl"
            >
              <Spinner v-if="isSubmittingAuthCallback" data-icon="inline-start" />
              {{ t('settings.mcp.completeAuthentication') }}
            </DcButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="isDiagnosticsOpen">
      <DialogContent
        class="flex min-h-0 flex-col gap-0 overflow-hidden p-0"
        :style="{
          '--primary': '#006eff',
          '--ring': '#006eff',
          width: '678px',
          minWidth: 'min(678px, calc(100vw - 64px))',
          height: '680px',
          maxWidth: 'calc(100vw - 64px)',
          maxHeight: 'calc(100vh - 48px)'
        }"
      >
        <DialogHeader class="shrink-0 space-y-1 border-b border-border/70 px-5 py-4">
          <DialogTitle class="text-lg font-semibold">
            {{ t('settings.mcp.diagnostics.title') }}
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            {{ diagnosticsServerName }}
          </DialogDescription>
        </DialogHeader>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div v-if="isDiagnosticsLoading" class="flex h-full items-center justify-center">
            <Spinner class="size-5" />
          </div>
          <div
            v-else-if="diagnosticsError"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {{ diagnosticsError }}
          </div>
          <dl
            v-else-if="diagnostics"
            class="overflow-hidden rounded-md bg-background [&>div+div]:border-t [&>div+div]:border-border/40"
          >
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.serverId') }}
              </dt>
              <dd class="break-all px-4 py-2.5 font-mono text-xs leading-5 text-foreground">
                {{ diagnostics.serverId }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.owner') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.owner }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.transport') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.transport }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.connectionState') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.connectionState }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.era') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.era }} {{ diagnostics.protocolVersion || '' }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.serverImplementation') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{
                  diagnostics.serverImplementation
                    ? `${diagnostics.serverImplementation.name} ${diagnostics.serverImplementation.version}`
                    : '-'
                }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.probe') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.probe.outcome }}
                {{ diagnostics.probe.reasonCode ? `· ${diagnostics.probe.reasonCode}` : '' }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.extensions') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.extensions.join(', ') || '-' }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.clientExtensions') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{
                  diagnostics.clientExtensions
                    .map((extension) =>
                      extension.revision ? `${extension.id}@${extension.revision}` : extension.id
                    )
                    .join(', ') || '-'
                }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.cache') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.cacheState }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.subscriptions') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.subscriptions.join(', ') || '-' }}
              </dd>
            </div>
            <div class="grid grid-cols-[180px_minmax(0,1fr)] odd:bg-[#F7FAFE]">
              <dt class="px-4 py-2.5 text-[13px] leading-5 text-[#5C78A0]">
                {{ t('settings.mcp.diagnostics.auth') }}
              </dt>
              <dd class="break-all px-4 py-2.5 text-xs leading-5 text-foreground">
                {{ diagnostics.auth.state }}
                {{ diagnostics.auth.mode ? `· ${diagnostics.auth.mode}` : '' }}
                {{
                  diagnostics.auth.persistent === undefined
                    ? ''
                    : `· persistent=${diagnostics.auth.persistent}`
                }}
              </dd>
            </div>
          </dl>
        </div>
        <div class="flex shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-4">
          <DcCopyButton
            :disabled="!diagnostics"
            :copy-text="diagnosticsText"
            :label="t('settings.mcp.diagnostics.copy')"
            variant="outline"
            class="h-9 w-[124px] rounded-lg"
          />
          <DcButton
            :disabled="isDiagnosticsLoading"
            class="h-9 w-[92px] rounded-lg"
            @click="refreshDiagnostics"
          >
            <Icon icon="lucide:refresh-cw" class="size-3.5" />
            {{ t('mcp.tools.refresh') }}
          </DcButton>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Tool panel -->
    <McpToolPanel v-model:open="isToolPanelOpen" :server-name="selectedServerForTools" />

    <!-- Prompt panel -->
    <McpPromptPanel v-model:open="isPromptPanelOpen" :server-name="selectedServerForPrompts" />

    <!-- Resource viewer -->
    <McpResourceViewer
      v-model:open="isResourceViewerOpen"
      :server-name="selectedServerForResources"
    />
  </div>
</template>
