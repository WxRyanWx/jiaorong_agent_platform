# 实施方案

1. 在主进程日志事件目录中新增 `app.startup.stage`，阶段名使用固定枚举。
2. 将阶段枚举和纯计时实现收敛到 `src/jiaorong_src/logging/startupTelemetry.ts`，主进程日志层只保留适配函数。
3. 在 `appMain.ts` 记录 Electron ready 相对主进程开始的耗时。
4. 在 `mainProcess.ts` 测量设置存储、数据库初始化、配置迁移、协议注册和主进程装配。
5. 在 `composition.ts` 测量以下串行阶段：
   - Jiaorong app host registration and legacy system app migration
   - ACP registry migration
   - builtin MCP allowlist migration
   - plugin host
   - skill service
   - skill sync
   - pending Agent Skill cleanup
   - app window creation
   - artifact spool
   - CLI server
   - CLI launcher
6. 在主窗口 `ready-to-show` 且实际 `show()` 后记录 `app_window_visible`。
7. 保持原有 `await` 顺序和异常传播，阶段结束时在 `finally` 中记录耗时。
8. 更新日志投影测试，确认输出字段和未知阶段拒绝。

## 数据流

主进程启动阶段 -> monotonic clock 计时 -> `mainLogger.emit('app.startup.stage')` -> JSONL 投影 -> `main.jsonl`。

renderer 关键加载阶段 -> renderer monotonic clock 计时 -> `performance.recordRenderer` -> schema 校验 -> `renderer-performance.ndjson`。两个文件使用 `startupRunId` 和日志时间戳关联。

## Windows 采集

在产品电脑启用“设置 → 通用 → 启用日志”后重启客户端，等待界面加载完成。下面整段是一条 PowerShell 指令，直接粘贴执行；它会输出完整时间线、最耗时节点，并在桌面生成报告和日志包：

```powershell
& {
  $logDirectory = Join-Path $env:APPDATA 'JiaorongAI\logs'
  $mainLogPath = Join-Path $logDirectory 'main.jsonl'
  $rendererLogPath = Join-Path $logDirectory 'renderer-performance.ndjson'
  if (-not (Test-Path $mainLogPath)) { throw 'main.jsonl 不存在，请先启用日志并重启客户端' }
  $mainRecords = @(Get-Content $mainLogPath | ForEach-Object {
    try { $_ | ConvertFrom-Json } catch { }
  })
  $rendererRecords = if (Test-Path $rendererLogPath) {
    @(Get-Content $rendererLogPath | ForEach-Object {
      try { $_ | ConvertFrom-Json } catch { }
    })
  } else {
    @()
  }
  $startupRun = $mainRecords | Where-Object { $_.event -eq 'app.startup.started' } |
    Select-Object -Last 1
  if (-not $startupRun) { throw 'main.jsonl 中没有 app.startup.started' }
  $runId = $startupRun.context.startupRunId
  $startupTime = [datetimeoffset]::Parse($startupRun.ts).LocalDateTime
  $mainTimeline = @($mainRecords |
    Where-Object { $_.context.startupRunId -eq $runId -and $_.event -like 'app.startup.*' } |
    ForEach-Object {
      $time = [datetimeoffset]::Parse($_.ts).LocalDateTime
      $stage = if ($_.event -eq 'app.startup.stage') { $_.context.stage } else { $_.event }
      [pscustomobject]@{
        Time = $time
        Source = 'main'
        Stage = $stage
        Kind = if ($stage -in @('main_process_control', 'app_window_visible', 'app.startup.terminal')) { 'inclusive' } else { 'segment' }
        DurationMs = $_.context.durationMs
        RelativeMs = [int64](($time - $startupTime).TotalMilliseconds)
      }
    })
  $rendererTimeline = @($rendererRecords |
    Where-Object { $_.scope -eq 'startup' -and $_.startupRunId -eq $runId } |
    ForEach-Object {
      $time = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$_.recordedAt).LocalDateTime
      [pscustomobject]@{
        Time = $time
        Source = 'renderer'
        Stage = $_.phase
        Kind = 'renderer-elapsed'
        DurationMs = $_.elapsedMs
        RelativeMs = [int64](($time - $startupTime).TotalMilliseconds)
      }
    })
  $sortedTimeline = @(@($mainTimeline) + @($rendererTimeline) | Sort-Object Time)
  $timeline = for ($eventIndex = 0; $eventIndex -lt $sortedTimeline.Count; $eventIndex++) {
    $currentEvent = $sortedTimeline[$eventIndex]
    $previousEvent = if ($eventIndex -eq 0) { $null } else { $sortedTimeline[$eventIndex - 1] }
    $gapMs = if ($null -eq $previousEvent) {
      0
    } else {
      [int64](($currentEvent.Time - $previousEvent.Time).TotalMilliseconds)
    }
    $currentEvent | Add-Member -NotePropertyName GapMs -NotePropertyValue $gapMs -PassThru
  }
  $slowest = @($timeline |
    Where-Object { $null -ne $_.DurationMs } |
    Sort-Object DurationMs -Descending |
    Select-Object -First 20)
  Write-Host "startupRunId: $runId"
  $timeline | Format-Table Time, Source, Stage, Kind, DurationMs, RelativeMs, GapMs -AutoSize
  Write-Host ''
  Write-Host '=== Slowest checkpoints ==='
  $slowest | Format-Table Source, Stage, Kind, DurationMs, GapMs -AutoSize
  $desktopDirectory = [Environment]::GetFolderPath('Desktop')
  $reportPath = Join-Path $desktopDirectory 'jiaorong-startup-report.txt'
  $archivePaths = @($mainLogPath, $reportPath)
  if (Test-Path $rendererLogPath) { $archivePaths += $rendererLogPath }
  $reportText = @(
    ($timeline | Format-Table Time, Source, Stage, Kind, DurationMs, RelativeMs, GapMs -AutoSize | Out-String),
    ($slowest | Format-Table Source, Stage, Kind, DurationMs, GapMs -AutoSize | Out-String)
  ) -join [Environment]::NewLine
  Set-Content -Path $reportPath -Value $reportText -Encoding UTF8
  $archivePath = Join-Path $desktopDirectory 'jiaorong-startup-logs.zip'
  Compress-Archive -Path $archivePaths -DestinationPath $archivePath -Force
  Write-Host "Report: $reportPath"
  Write-Host "Archive: $archivePath"
}
```

双击图标到主进程模块加载前的时间无法由 JS 记录，需要外部记录双击时间和窗口出现时间。

`main_process_control`、`app_window_visible` 和 `app.startup.terminal` 是包含内部阶段的耗时，不能与子阶段相加；renderer 记录的 `DurationMs` 是相对 renderer 性能起点的累计值。`GapMs` 是相邻日志时间戳的差值，用于发现尚未埋点的空白区间，包含日志写入和 IPC 延迟。

## 测试策略

- 运行 `test/main/logging/mainLogEvents.test.ts` 验证事件输入、投影和枚举约束。
- 运行 `test/main/logging/startupTelemetry.test.ts` 验证成功、失败和时钟不可用时的计时行为。
- 运行相关 TypeScript 检查或最小测试套件，确认包装函数未改变类型与控制流。
- 在 Windows 上启用日志后检查 `app.startup.started`、全部 `app.startup.stage`、`app.startup.terminal` 与 renderer `interactive` 可按时间排序。
