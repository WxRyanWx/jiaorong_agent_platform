export const JIAORONG_STARTUP_STAGES = [
  'acp_registry_migration',
  'app_window_visible',
  'builtin_mcp_allowlist_migration',
  'config_store_setup',
  'config_storage_migration',
  'database_initialization',
  'electron_ready',
  'jiaorong_app_host',
  'main_process_control',
  'plugin_host',
  'protocol_registration',
  'skill_service',
  'skill_sync',
  'settings_store',
  'agent_skill_cleanup',
  'app_window',
  'artifact_spool',
  'cli_server',
  'cli_launcher'
] as const

export type JiaorongStartupStage = (typeof JIAORONG_STARTUP_STAGES)[number]

export type JiaorongStartupStageRecord = {
  startupRunId: string
  stage: JiaorongStartupStage
  durationMs: number
}

export type JiaorongStartupStageTelemetry = {
  reportStartupStage: (stage: JiaorongStartupStage, startedAt: number | undefined) => void
  measureStartupStage: <T>(stage: JiaorongStartupStage, operation: () => Promise<T>) => Promise<T>
}

type StartupStageTelemetryDependencies = {
  startupRunId: string
  emitStage: (record: JiaorongStartupStageRecord) => void
  readNow: () => number | undefined
  elapsedSince: (startedAt: number | undefined) => number | undefined
}

export const createStartupStageTelemetry = (
  dependencies: StartupStageTelemetryDependencies
): JiaorongStartupStageTelemetry => {
  const reportStartupStage = (stage: JiaorongStartupStage, startedAt: number | undefined): void => {
    const durationMs = dependencies.elapsedSince(startedAt)
    if (durationMs === undefined) return

    dependencies.emitStage({
      startupRunId: dependencies.startupRunId,
      stage,
      durationMs
    })
  }

  const measureStartupStage = async <T>(
    stage: JiaorongStartupStage,
    operation: () => Promise<T>
  ): Promise<T> => {
    const startedAt = dependencies.readNow()
    try {
      return await operation()
    } finally {
      reportStartupStage(stage, startedAt)
    }
  }

  return { reportStartupStage, measureStartupStage }
}
