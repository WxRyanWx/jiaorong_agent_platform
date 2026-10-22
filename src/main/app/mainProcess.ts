import { electronApp } from '@electron-toolkit/utils'
import { app } from 'electron'
import { createSettingsStore } from '@/config/settingsStore'
import { SecretStore } from '@/config/secretStore'
import { DatabaseSecurityService } from './databaseSecurity'
import { proxyConfig } from '@/platform/proxy'
import type { StartupWorkloadCoordinator } from '@/app/startupWorkloadCoordinator'
import { createMainProcessControl, type MainProcessControl } from './composition'
import { initializeMainDatabaseWithRecovery } from './databaseStartup'
import { registerProtocols } from './protocols'
import { McpAppSandboxRegistry } from '@/mcp/apps/sandboxRegistry'
import { SplashWindow } from './splashWindow'
import { PrivacySettings } from './privacy'
import { ProxySettings } from '@/platform/proxySettings'
import { McpSettings } from '@/mcp/settings'
import { AcpCatalogSettings } from '@/agent/acp/catalog/settings'
import { SettingsDatabase } from '@/settings/data/database'
import { migrateConfigStorage } from '@/config/migration'
import { ProviderDatabase } from '@/provider/data/database'
import { McpDatabase } from '@/mcp/data/database'
import { AgentDatabase } from '@/agent/data/database'
import { createMainStartupStageTelemetry, mainLogger, setMainLoggingEnabled } from '@/logging'

export type { MainProcessControl } from './composition'

export async function startMainProcess(
  startupWorkloadCoordinator: StartupWorkloadCoordinator,
  startupRunId: string,
  startupStartedAt: number | undefined,
  requestUpdateInstall: (installAction: () => void) => Promise<void>
): Promise<MainProcessControl> {
  const splashWindow = new SplashWindow()
  let mainProcess: MainProcessControl | undefined
  let database: Awaited<ReturnType<typeof initializeMainDatabaseWithRecovery>> | undefined
  const { reportStartupStage, measureStartupStage } = createMainStartupStageTelemetry(startupRunId)
  let didReportAppWindowVisible = false

  const reportAppWindowVisible = (isMainWindow: boolean): void => {
    if (!isMainWindow || didReportAppWindowVisible) return
    didReportAppWindowVisible = true
    reportStartupStage('app_window_visible', startupStartedAt)
  }

  try {
    electronApp.setAppUserModelId('com.wefonk.jiaorong')
    const settingsStore = await measureStartupStage('settings_store', async () => {
      const store = createSettingsStore()
      setMainLoggingEnabled(store.get<boolean>('loggingEnabled') ?? false)
      return store
    })
    const startupStores = await measureStartupStage('config_store_setup', async () => {
      const secretStore = new SecretStore(settingsStore)
      const privacySettings = new PrivacySettings(settingsStore)
      const proxySettings = new ProxySettings(settingsStore)
      const mcpSettings = new McpSettings()
      const mcpAppSandboxRegistry = new McpAppSandboxRegistry()
      const acpCatalogSettings = new AcpCatalogSettings({ mcpSettings })
      const databaseSecurityService = new DatabaseSecurityService()
      return {
        secretStore,
        privacySettings,
        proxySettings,
        mcpSettings,
        mcpAppSandboxRegistry,
        acpCatalogSettings,
        databaseSecurityService
      }
    })
    const {
      secretStore,
      privacySettings,
      proxySettings,
      mcpSettings,
      mcpAppSandboxRegistry,
      acpCatalogSettings,
      databaseSecurityService
    } = startupStores
    const securityStatus = databaseSecurityService.getStatus()
    splashWindow.showDatabaseUnlockProgress(
      {
        active: securityStatus.enabled,
        safeStorageAvailable: securityStatus.safeStorageAvailable
      },
      { skipDelay: securityStatus.enabled }
    )
    const initializedDatabase = await measureStartupStage(
      'database_initialization',
      async () =>
        await initializeMainDatabaseWithRecovery({
          security: databaseSecurityService,
          splash: splashWindow,
          observe: (observation) => {
            const context = {
              ...(observation.durationMs === undefined
                ? {}
                : { durationMs: observation.durationMs }),
              repairAttempted: observation.repairAttempted,
              schemaDiagnosis: observation.schemaDiagnosis,
              repairableIssueCount: observation.repairableIssueCount,
              manualIssueCount: observation.manualIssueCount
            }
            if (observation.outcome === 'failed') {
              mainLogger.emit('database.initialization.terminal', {
                ...context,
                outcome: 'failed',
                error: observation.error
              })
            } else {
              mainLogger.emit('database.initialization.terminal', {
                ...context,
                outcome: 'completed'
              })
            }
          }
        })
    )
    database = initializedDatabase
    splashWindow.showDatabaseUnlockProgress({
      active: false,
      safeStorageAvailable: databaseSecurityService.getStatus().safeStorageAvailable
    })
    const settingsDatabase = new SettingsDatabase(database)
    const providerDatabase = new ProviderDatabase(database)
    const mcpDatabase = new McpDatabase(database)
    const agentDatabase = new AgentDatabase(database)
    const configMigration = await measureStartupStage('config_storage_migration', async () =>
      migrateConfigStorage({
        database: settingsDatabase,
        providerDatabase,
        mcpDatabase,
        agentDatabase,
        settings: settingsStore,
        mcpSettings: mcpSettings.getMigrationSnapshot(),
        acpCatalog: acpCatalogSettings.getMigrationSnapshot(),
        userDataPath: app.getPath('userData')
      })
    )
    settingsStore.attachDatabase(settingsDatabase)
    mcpSettings.connectDatabase(mcpDatabase)
    acpCatalogSettings.connectDatabase(agentDatabase)
    if (configMigration.appVersionChanged) {
      mcpSettings.onUpgrade(configMigration.previousAppVersion)
    }
    proxyConfig.initFromConfig(proxySettings.getMode(), proxySettings.getCustomUrl())
    await measureStartupStage(
      'protocol_registration',
      async () => await registerProtocols(mcpAppSandboxRegistry)
    )

    mainProcess = await measureStartupStage(
      'main_process_control',
      async () =>
        await createMainProcessControl({
          previousAppVersion: configMigration.previousAppVersion,
          settingsStore,
          secretStore,
          privacySettings,
          proxySettings,
          mcpSettings,
          mcpAppSandboxRegistry,
          acpCatalogSettings,
          database: initializedDatabase,
          settingsDatabase,
          providerDatabase,
          agentDatabase,
          databaseSecurityService,
          startupWorkloadCoordinator,
          startupRunId,
          requestUpdateInstall,
          onWindowCreated: (isMainWindow) => {
            reportAppWindowVisible(isMainWindow)
            splashWindow.handleWindowCreated(isMainWindow)
          },
          splash: splashWindow,
          bindControl: (control) => {
            mainProcess = control
          }
        })
    )

    await splashWindow.close()
    return mainProcess
  } catch (error) {
    await splashWindow.close()
    if (mainProcess) {
      await mainProcess.stopForCleanup()
    } else {
      database?.close()
    }
    throw error
  }
}
