import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CREATE_APP_ENTRY_ENV,
  resolveCreateAppEntry,
  runCreateApp
} from '../../../src/cli/createApp'
import { CLI_EXIT_CODES } from '../../../src/cli/errors'

const temporaryDirectories: string[] = []

// test/setup.ts 把 fs 整个换成了空 mock，入口查找依赖真实的 existsSync
beforeEach(async () => {
  const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
  vi.mocked(existsSync).mockImplementation(actualFs.existsSync)
})

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) await rm(directory, { recursive: true, force: true })
  }
})

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deepchat-cli-create-app-'))
  temporaryDirectories.push(root)
  return root
}

/** 造一套打包后的资源布局：`<resources>/app.asar.unpacked/cli` 与同级脚手架。 */
async function createPackagedLayout(resources: string): Promise<string> {
  await mkdir(path.join(resources, 'app.asar.unpacked', 'cli'), { recursive: true })
  const entry = path.join(resources, 'create-jiaorong-app', 'bin', 'create-jiaorong-app.js')
  await mkdir(path.dirname(entry), { recursive: true })
  await writeFile(entry, '// stub\n')
  return entry
}

/** CLI 模块所在目录：入口查找根是它的上两级。 */
const cliDirectoryOf = (resources: string): string =>
  path.join(resources, 'app.asar.unpacked', 'cli')

describe('create app entry resolution', () => {
  it('finds the scaffold shipped beside the packaged CLI', async () => {
    const resources = await createFixture()
    const entry = await createPackagedLayout(resources)

    expect(resolveCreateAppEntry({ env: {}, cliDirectory: cliDirectoryOf(resources) })).toBe(entry)
  })

  it('falls back to the repository layout for development builds', async () => {
    const repository = await createFixture()
    const cliDirectory = path.join(repository, 'out', 'cli')
    await mkdir(cliDirectory, { recursive: true })
    const entry = path.join(
      repository,
      'tools',
      'create-jiaorong-app',
      'bin',
      'create-jiaorong-app.js'
    )
    await mkdir(path.dirname(entry), { recursive: true })
    await writeFile(entry, '// stub\n')

    expect(resolveCreateAppEntry({ env: {}, cliDirectory })).toBe(entry)
  })

  it('honours the explicit override and reports a missing installation', async () => {
    const root = await createFixture()
    const entry = path.join(root, 'custom-scaffold.js')
    await writeFile(entry, '// stub\n')

    expect(resolveCreateAppEntry({ env: { [CREATE_APP_ENTRY_ENV]: entry } })).toBe(entry)
    expect(
      resolveCreateAppEntry({ env: { [CREATE_APP_ENTRY_ENV]: path.join(root, 'missing.js') } })
    ).toBeNull()
    expect(resolveCreateAppEntry({ env: {}, cliDirectory: cliDirectoryOf(root) })).toBeNull()
  })
})

describe('create app execution', () => {
  it('runs the scaffold with the current Node and forwards the arguments', async () => {
    const resources = await createFixture()
    const entry = await createPackagedLayout(resources)
    const calls: Array<{ command: string; args: string[] }> = []
    const spawn = ((command: string, args: string[]) => {
      calls.push({ command, args })
      return { status: 0 }
    }) as unknown as typeof spawnSync

    const exitCode = runCreateApp(['my-app', '--no-ui'], {
      env: {},
      cliDirectory: cliDirectoryOf(resources),
      execPath: '/runtime/node',
      spawn
    })

    expect(exitCode).toBe(CLI_EXIT_CODES.success)
    expect(calls).toEqual([{ command: '/runtime/node', args: [entry, 'my-app', '--no-ui'] }])
  })

  // 脚手架已经把失败分好类，CLI 只负责原样往上传，别一律收成内部错误
  it.each([
    [0, CLI_EXIT_CODES.success],
    [1, CLI_EXIT_CODES.partial],
    [2, CLI_EXIT_CODES.usage],
    [7, CLI_EXIT_CODES.cancelled],
    [8, CLI_EXIT_CODES.internal]
  ])('forwards scaffold exit %i unchanged', async (status, expected) => {
    const resources = await createFixture()
    await createPackagedLayout(resources)
    const spawn = (() => ({ status })) as unknown as typeof spawnSync

    const exitCode = runCreateApp([], {
      env: {},
      cliDirectory: cliDirectoryOf(resources),
      spawn
    })

    expect(exitCode).toBe(expected)
  })

  it('falls back to the internal exit code for unknown codes and signals', async () => {
    const resources = await createFixture()
    await createPackagedLayout(resources)
    /** 认不出的退出码与被信号终止（status 为 null）都算内部错误。 */
    const spawnOf = (result: { status: number | null }) =>
      (() => result) as unknown as typeof spawnSync

    const unknown = runCreateApp([], {
      env: {},
      cliDirectory: cliDirectoryOf(resources),
      spawn: spawnOf({ status: 42 })
    })
    const signaled = runCreateApp([], {
      env: {},
      cliDirectory: cliDirectoryOf(resources),
      spawn: spawnOf({ status: null })
    })

    expect(unknown).toBe(CLI_EXIT_CODES.internal)
    expect(signaled).toBe(CLI_EXIT_CODES.internal)
  })

  it('reports a scaffold that cannot start and a missing installation', async () => {
    const resources = await createFixture()
    await createPackagedLayout(resources)
    const missing = await createFixture()
    await mkdir(cliDirectoryOf(missing), { recursive: true })
    const messages: string[] = []
    const spawn = (() => ({
      status: null,
      error: new Error('spawn EACCES')
    })) as unknown as typeof spawnSync
    const writeError = (message: string): void => {
      messages.push(message)
    }

    const startFailure = runCreateApp([], {
      env: {},
      cliDirectory: cliDirectoryOf(resources),
      spawn,
      writeError
    })
    const unavailable = runCreateApp([], {
      env: {},
      cliDirectory: cliDirectoryOf(missing),
      spawn,
      writeError
    })

    expect(startFailure).toBe(CLI_EXIT_CODES.internal)
    expect(unavailable).toBe(CLI_EXIT_CODES.unavailable)
    expect(messages.join('\n')).toContain('spawn EACCES')
    expect(messages.join('\n')).toContain('unavailable')
  })
})
