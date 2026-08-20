import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SECRET_PREFIX,
  revealBuiltinSecret,
  sealBuiltinSecret
} from '@jiaorong/provider/builtinSecret'

describe('builtinSecret', () => {
  it('round-trips a sealed value', () => {
    const sealed = sealBuiltinSecret('sample-secret')
    expect(sealed.startsWith(`${BUILTIN_SECRET_PREFIX}.`)).toBe(true)
    expect(revealBuiltinSecret(sealed)).toBe('sample-secret')
  })

  it('passes through unsealed provider keys', () => {
    expect(revealBuiltinSecret('user-pasted-key')).toBe('user-pasted-key')
    expect(revealBuiltinSecret('')).toBe('')
  })

  it('returns empty when a sealed value cannot be opened', () => {
    expect(revealBuiltinSecret(`${BUILTIN_SECRET_PREFIX}.bad`)).toBe('')
    expect(revealBuiltinSecret(`${BUILTIN_SECRET_PREFIX}.aaaa.bbbb.cccc`)).toBe('')
  })

  it('uses the same seal implementation from the CLI script', () => {
    const script = fileURLToPath(
      new URL('../../../src/jiaorong_src/provider/scripts/seal-builtin-secret.mjs', import.meta.url)
    )
    const result = spawnSync(process.execPath, [script], {
      input: 'script-roundtrip-secret',
      encoding: 'utf8'
    })
    expect(result.status).toBe(0)
    expect(revealBuiltinSecret(result.stdout.trim())).toBe('script-roundtrip-secret')
  })
})
