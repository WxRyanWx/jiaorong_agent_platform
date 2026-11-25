import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    default: actual
  }
})

import {
  buildRuntimeInstallPlan,
  loadRuntimeVersions,
  parseRuntimeInstallArgs,
  runtimeVersionsPath,
  extractWindowsRuntimeZip,
  runRuntimeInstallPlan,
  windowsRuntimeArchive
} from '../../../scripts/install-runtime.mjs'

describe('install-runtime', () => {
  it('loads every pinned toolchain version from one manifest', () => {
    expect(loadRuntimeVersions()).toMatchObject({
      tinyRuntimeInjector: '1.2.0',
      node: 'v24.18.0',
      uv: '0.9.18',
      rtk: 'v0.43.0'
    })
    expect(loadRuntimeVersions().nodeArtifacts['darwin-arm64'].executableSha256).toMatch(
      /^[a-f0-9]{64}$/
    )
  })

  it('keeps the schema-v2 toolchain envelope readable after OCR metadata advances', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'deepchat-runtime-versions-test-'))
    try {
      const manifest = JSON.parse(await readFile(runtimeVersionsPath, 'utf8'))
      manifest.schemaVersion = 2
      const manifestPath = path.join(tempDir, 'runtime-versions.json')
      await writeFile(manifestPath, JSON.stringify(manifest))

      expect(loadRuntimeVersions(manifestPath)).toMatchObject({
        tinyRuntimeInjector: manifest.tinyRuntimeInjector,
        node: manifest.node,
        uv: manifest.uv,
        rtk: manifest.rtk
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('builds an explicitly versioned plan for supported targets', () => {
    const plan = buildRuntimeInstallPlan({
      platform: 'linux',
      arch: 'x64',
      rootDir: '/repo'
    })

    expect(plan.map(({ type, version }) => ({ type, version }))).toEqual([
      { type: 'uv', version: '0.9.18' },
      { type: 'node', version: 'v24.18.0' },
      { type: 'rtk', version: 'v0.43.0' }
    ])
    for (const step of plan) {
      expect(step.args).toContain('tiny-runtime-injector@1.2.0')
      expect(step.args).toContain('--runtime-version')
      expect(step.args).toContain(step.version)
      expect(step.args).toContain(path.join('/repo', 'runtime', step.type))
    }
  })

  it('preserves the unsupported RTK target exception for Windows arm64', () => {
    const plan = buildRuntimeInstallPlan({ platform: 'win32', arch: 'arm64' })

    expect(plan.map((step) => step.type)).toEqual(['uv', 'node'])
  })

  it.each(['x64', 'arm64'])('builds a Node-only plan for Linux %s', (arch) => {
    const options = parseRuntimeInstallArgs([
      '--platform=linux',
      `--arch=${arch}`,
      '--types',
      'node'
    ])
    const plan = buildRuntimeInstallPlan({
      platform: options.platform,
      arch: options.arch,
      types: options.types,
      rootDir: '/repo'
    })

    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      type: 'node',
      platform: 'linux',
      arch,
      executablePath: path.join('/repo', 'runtime', 'node', 'bin', 'node'),
      expectedExecutableSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
  })

  it('accepts an explicit package root for reproducible baseline assets', () => {
    expect(parseRuntimeInstallArgs(['--root-dir', '/baseline'])).toMatchObject({
      'root-dir': '/baseline'
    })
    expect(parseRuntimeInstallArgs(['--root-dir=/baseline'])).toMatchObject({
      'root-dir': '/baseline'
    })
  })

  it('rejects unknown targets and malformed arguments before downloading', () => {
    expect(() => buildRuntimeInstallPlan({ platform: 'freebsd', arch: 'x64' })).toThrow(
      /Unsupported runtime platform/
    )
    expect(() => buildRuntimeInstallPlan({ platform: 'linux', arch: 'ia32' })).toThrow(
      /Unsupported runtime architecture/
    )
    expect(() => parseRuntimeInstallArgs(['--platform'])).toThrow(/Missing value/)
    expect(() => parseRuntimeInstallArgs(['--types', 'node,unknown'])).toThrow(
      /Unsupported runtime type/
    )
    expect(() => parseRuntimeInstallArgs(['--typo', 'linux'])).toThrow(/Unknown/)
  })

  it('builds Windows runtime zip urls without Expand-Archive', () => {
    const plan = buildRuntimeInstallPlan({ platform: 'win32', arch: 'arm64' })
    const uv = plan.find((step) => step.type === 'uv')
    const node = plan.find((step) => step.type === 'node')

    expect(windowsRuntimeArchive(uv).url).toBe(
      'https://github.com/astral-sh/uv/releases/download/0.9.18/uv-aarch64-pc-windows-msvc.zip'
    )
    expect(windowsRuntimeArchive(node).url).toBe(
      'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-arm64.zip'
    )
  })

  it('builds the Windows x64 rtk zip url without Expand-Archive', () => {
    const plan = buildRuntimeInstallPlan({ platform: 'win32', arch: 'x64' })
    const rtk = plan.find((step) => step.type === 'rtk')

    expect(windowsRuntimeArchive(rtk).url).toBe(
      'https://github.com/rtk-ai/rtk/releases/download/v0.43.0/rtk-x86_64-pc-windows-msvc.zip'
    )
    expect(() => windowsRuntimeArchive({ ...rtk, arch: 'arm64' })).toThrow(/only published/)
  })

  it('lifts uv and node files out of a Windows zip', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-zip-'))
    try {
      const uvDir = path.join(root, 'uv')
      await extractWindowsRuntimeZip(
        zipSync({
          'nested/uv.exe': strToU8('uv'),
          'nested/uvx.exe': strToU8('uvx'),
          'nested/README.md': strToU8('skip')
        }),
        uvDir,
        'uv'
      )
      expect(await readFile(path.join(uvDir, 'uv.exe'), 'utf8')).toBe('uv')
      expect(await readFile(path.join(uvDir, 'uvx.exe'), 'utf8')).toBe('uvx')
      await expect(readFile(path.join(uvDir, 'README.md'), 'utf8')).rejects.toThrow()

      const nodeDir = path.join(root, 'node')
      await extractWindowsRuntimeZip(
        zipSync({
          'node-v24.18.0-win-arm64/node.exe': strToU8('node'),
          'node-v24.18.0-win-arm64/node_modules/npm/package.json': strToU8('{}')
        }),
        nodeDir,
        'node'
      )
      expect(await readFile(path.join(nodeDir, 'node.exe'), 'utf8')).toBe('node')
      expect(await readFile(path.join(nodeDir, 'node_modules', 'npm', 'package.json'), 'utf8')).toBe(
        '{}'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('lifts rtk.exe out of a Windows zip', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-zip-'))
    try {
      const rtkDir = path.join(root, 'rtk')
      await extractWindowsRuntimeZip(
        zipSync({
          'rtk.exe': strToU8('rtk'),
          'README.md': strToU8('skip')
        }),
        rtkDir,
        'rtk'
      )
      expect(await readFile(path.join(rtkDir, 'rtk.exe'), 'utf8')).toBe('rtk')
      await expect(readFile(path.join(rtkDir, 'README.md'), 'utf8')).rejects.toThrow()

      const nestedDir = path.join(root, 'rtk-nested')
      await extractWindowsRuntimeZip(
        zipSync({ 'rtk-v0.43.0/rtk.exe': strToU8('nested') }),
        nestedDir,
        'rtk'
      )
      expect(await readFile(path.join(nestedDir, 'rtk.exe'), 'utf8')).toBe('nested')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('installs Windows zip runtimes without calling tiny-runtime-injector', async () => {
    const plan = buildRuntimeInstallPlan({ platform: 'win32', arch: 'arm64' })
    const spawn = vi.fn()
    const verify = vi.fn().mockResolvedValue(undefined)
    const installWindowsZipRuntime = vi.fn().mockResolvedValue(undefined)

    await runRuntimeInstallPlan(plan, spawn, verify, {
      hostPlatform: 'win32',
      installWindowsZipRuntime
    })

    expect(spawn).not.toHaveBeenCalled()
    expect(installWindowsZipRuntime.mock.calls.map(([step]) => step.type)).toEqual(['uv', 'node'])
    expect(verify).toHaveBeenCalledTimes(2)
  })

  it('installs rtk through the Windows zip path on x64', async () => {
    const plan = buildRuntimeInstallPlan({ platform: 'win32', arch: 'x64' })
    const spawn = vi.fn()
    const verify = vi.fn().mockResolvedValue(undefined)
    const installWindowsZipRuntime = vi.fn().mockResolvedValue(undefined)

    await runRuntimeInstallPlan(plan, spawn, verify, {
      hostPlatform: 'win32',
      installWindowsZipRuntime
    })

    expect(spawn).not.toHaveBeenCalled()
    expect(installWindowsZipRuntime.mock.calls.map(([step]) => step.type)).toEqual([
      'uv',
      'node',
      'rtk'
    ])
    expect(verify).toHaveBeenCalledTimes(3)
  })

  it('stops at the first failed runtime installation', async () => {
    const plan = buildRuntimeInstallPlan({ platform: 'darwin', arch: 'arm64' })
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 2 })
    const verify = vi.fn().mockResolvedValue(undefined)

    await expect(runRuntimeInstallPlan(plan, spawn, verify)).rejects.toThrow(
      /node runtime installation failed/
    )
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(verify).toHaveBeenCalledTimes(1)
  })
})
