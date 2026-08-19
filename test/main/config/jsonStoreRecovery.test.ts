import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    default: actual
  }
})

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  prepareJsonStoreFile,
  quarantineInvalidJsonFile
} from '../../../src/main/config/jsonStoreRecovery'

describe('jsonStoreRecovery', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  const makeTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiaorong-json-store-'))
    tempDirs.push(dir)
    return dir
  }

  it('does nothing when the store file is missing', () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'app-settings.json')
    const result = quarantineInvalidJsonFile(filePath)
    expect(result.quarantined).toBe(false)
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('leaves valid JSON untouched', () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'app-settings.json')
    fs.writeFileSync(filePath, '{\n\t"language": "zh-CN"\n}\n', 'utf8')

    const result = quarantineInvalidJsonFile(filePath)
    expect(result.quarantined).toBe(false)
    expect(fs.readFileSync(filePath, 'utf8')).toContain('"language"')
  })

  it('quarantines truncated JSON so electron-store can recreate defaults', () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'app-settings.json')
    fs.writeFileSync(
      filePath,
      '{\n\t"loggingEnabled": false,\n\t"defaultProjectPath": "E:\\\\broken\n}\n',
      'utf8'
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = quarantineInvalidJsonFile(filePath)
    expect(result.quarantined).toBe(true)
    expect(result.backupPath).toBeTruthy()
    expect(fs.existsSync(filePath)).toBe(false)
    expect(fs.existsSync(result.backupPath!)).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('prepareJsonStoreFile resolves <cwd>/<name>.json', () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'mcp-settings.json')
    fs.writeFileSync(filePath, '{not-json', 'utf8')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = prepareJsonStoreFile(dir, 'mcp-settings')
    expect(result.quarantined).toBe(true)
    expect(fs.existsSync(filePath)).toBe(false)
  })
})
