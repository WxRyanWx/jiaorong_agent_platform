import { describe, expect, it } from 'vitest'
import {
  createStartupStageTelemetry,
  type JiaorongStartupStageRecord
} from '@jiaorong/logging/startupTelemetry'

describe('startup stage telemetry', () => {
  it('measures successful operations', async () => {
    let now = 0
    const records: JiaorongStartupStageRecord[] = []
    const telemetry = createStartupStageTelemetry({
      startupRunId: 'main:1',
      emitStage: (record) => {
        records.push(record)
      },
      readNow: () => now,
      elapsedSince: (startedAt) => (startedAt === undefined ? undefined : now - startedAt)
    })

    const result = await telemetry.measureStartupStage('app_window', async () => {
      now = 25
      return 'window-1'
    })

    expect(result).toBe('window-1')
    expect(records).toEqual([{ startupRunId: 'main:1', stage: 'app_window', durationMs: 25 }])
  })

  it('emits duration when an operation fails', async () => {
    let now = 10
    const records: Array<{ durationMs: number }> = []
    const telemetry = createStartupStageTelemetry({
      startupRunId: 'main:1',
      emitStage: (record) => {
        records.push({ durationMs: record.durationMs })
      },
      readNow: () => now,
      elapsedSince: (startedAt) => (startedAt === undefined ? undefined : now - startedAt)
    })

    await expect(
      telemetry.measureStartupStage('database_initialization', async () => {
        now = 30
        throw new Error('database unavailable')
      })
    ).rejects.toThrow('database unavailable')
    expect(records).toEqual([{ durationMs: 20 }])
  })

  it('skips records when monotonic time is unavailable', async () => {
    const records: unknown[] = []
    const telemetry = createStartupStageTelemetry({
      startupRunId: 'main:1',
      emitStage: (record) => {
        records.push(record)
      },
      readNow: () => undefined,
      elapsedSince: () => undefined
    })

    await telemetry.measureStartupStage('app_window', async () => 'window-1')

    expect(records).toEqual([])
  })
})
