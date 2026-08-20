#!/usr/bin/env node
/**
 * Seal a builtin provider secret for src/main/provider/defaults.ts.
 * Delegates to builtinSecret.ts so wrapping material cannot drift.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ts = fileURLToPath(new URL('./seal-builtin-secret.ts', import.meta.url))
const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', ts, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env }
)

process.exit(result.status ?? 1)
