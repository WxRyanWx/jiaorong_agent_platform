export const JIAORONG_STARTUP_STAGES = [
  'acp_registry_migration',
  'app_window_visible',
  'builtin_mcp_allowlist_migration',
  'config_store_setup',
  'config_storage_migration',
  'database_initialization',
  'electron_ready',
  'jiaorong_app_host',
  'main_process_composition',
  'main_process_control',
  'plugin_host',
  'protocol_registration',
  'skill_service',
  'skill_sync',
  'skill_builtin_install',
  'skill_builtin_prune',
  'skill_builtin_hash',
  'skill_builtin_copy',
  'skill_builtin_readonly_scan',
  'skill_draft_cleanup',
  'skill_discovery',
  'skill_discovery_worker',
  'skill_discovery_fallback',
  'skill_discovery_plugin',
  'skill_discovery_aggregate',
  'skill_shared_migration',
  'skill_shared_migration_resume',
  'skill_shared_migration_prune',
  'skill_shared_migration_reconcile',
  'skill_shared_migration_bindings',
  'skill_shared_migration_cleanup',
  'skill_shared_migration_plan',
  'skill_shared_migration_copy',
  'skill_shared_migration_commit',
  'skill_shared_migration_session_remap',
  'skill_file_watcher',
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
