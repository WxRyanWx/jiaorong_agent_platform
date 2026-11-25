import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import crossSpawn from 'cross-spawn'
import { unzipSync } from 'fflate'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = path.resolve(scriptDir, '..')
export const runtimeVersionsPath = path.join(repositoryRoot, 'resources', 'runtime-versions.json')

const supportedPlatforms = new Set(['darwin', 'linux', 'win32'])
const supportedArchitectures = new Set(['arm64', 'x64'])
const supportedRuntimeTypes = new Set(['node', 'rtk', 'uv'])
const supportedToolchainManifestSchemas = new Set([2, 3])
const sha256Pattern = /^[a-f0-9]{64}$/

export function loadRuntimeVersions(manifestPath = runtimeVersionsPath) {
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const requiredKeys = ['tinyRuntimeInjector', 'node', 'uv', 'rtk']

  if (!supportedToolchainManifestSchemas.has(parsed.schemaVersion)) {
    throw new Error(`Unsupported runtime version manifest schema: ${parsed.schemaVersion}`)
  }
  for (const key of requiredKeys) {
    if (typeof parsed[key] !== 'string' || parsed[key].trim() === '') {
      throw new Error(`Runtime version manifest is missing a valid ${key} value`)
    }
  }
  if (!parsed.nodeArtifacts || typeof parsed.nodeArtifacts !== 'object') {
    throw new Error('Runtime version manifest is missing Node artifact integrity metadata')
  }
  const nodeArtifacts = {}
  for (const platform of supportedPlatforms) {
    for (const arch of supportedArchitectures) {
      const target = `${platform}-${arch}`
      const artifact = parsed.nodeArtifacts[target]
      if (
        !artifact ||
        !sha256Pattern.test(artifact.executableSha256)
      ) {
        throw new Error(`Runtime version manifest has invalid Node integrity metadata for ${target}`)
      }
      nodeArtifacts[target] = Object.freeze({
        executableSha256: artifact.executableSha256
      })
    }
  }

  return Object.freeze({
    tinyRuntimeInjector: parsed.tinyRuntimeInjector,
    node: parsed.node,
    uv: parsed.uv,
    rtk: parsed.rtk,
    nodeArtifacts: Object.freeze(nodeArtifacts)
  })
}

export function parseRuntimeInstallArgs(argv) {
  const options = { dryRun: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (
      argument === '--platform' ||
      argument === '--arch' ||
      argument === '--types' ||
      argument === '--root-dir'
    ) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`)
      }
      const key = argument.slice(2)
      options[key] = key === 'types' ? parseRuntimeTypes(value) : value
      index += 1
      continue
    }
    if (
      argument.startsWith('--platform=') ||
      argument.startsWith('--arch=') ||
      argument.startsWith('--types=') ||
      argument.startsWith('--root-dir=')
    ) {
      const [key, value] = argument.slice(2).split('=', 2)
      if (!value) throw new Error(`Missing value for --${key}`)
      options[key] = key === 'types' ? parseRuntimeTypes(value) : value
      continue
    }
    throw new Error(`Unknown runtime installer argument: ${argument}`)
  }

  return options
}

function parseRuntimeTypes(value) {
  const types = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  if (types.length === 0 || types.some((type) => !supportedRuntimeTypes.has(type))) {
    throw new Error(`Unsupported runtime type selection: ${value}`)
  }
  return types
}

function validateTarget(platform, arch) {
  if (!supportedPlatforms.has(platform)) {
    throw new Error(`Unsupported runtime platform: ${platform}`)
  }
  if (!supportedArchitectures.has(arch)) {
    throw new Error(`Unsupported runtime architecture: ${arch}`)
  }
}

export function buildRuntimeInstallPlan({
  platform = process.platform,
  arch = process.arch,
  rootDir = repositoryRoot,
  versions = loadRuntimeVersions(),
  types
} = {}) {
  validateTarget(platform, arch)

  let runtimes = [
    { type: 'uv', version: versions.uv },
    { type: 'node', version: versions.node }
  ]
  if (!(platform === 'win32' && arch === 'arm64')) {
    runtimes.push({ type: 'rtk', version: versions.rtk })
  }

  if (types) runtimes = runtimes.filter(({ type }) => types.includes(type))
  if (runtimes.length === 0) {
    throw new Error(`No selected runtimes are available for ${platform}-${arch}`)
  }

  return runtimes.map(({ type, version }) => ({
    command: 'pnpm',
    args: [
      'dlx',
      `tiny-runtime-injector@${versions.tinyRuntimeInjector}`,
      '--type',
      type,
      '--dir',
      path.join(rootDir, 'runtime', type),
      '--runtime-version',
      version,
      '--arch',
      arch,
      '--platform',
      platform
    ],
    type,
    version,
    platform,
    arch,
    ...(type === 'node'
      ? {
          executablePath: path.join(
            rootDir,
            'runtime',
            'node',
            ...(platform === 'win32' ? ['node.exe'] : ['bin', 'node'])
          ),
          expectedExecutableSha256: versions.nodeArtifacts[`${platform}-${arch}`]
            .executableSha256
        }
      : {})
  }))
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolve)
  })
  return hash.digest('hex')
}

export async function verifyInstalledRuntime(step, spawn = crossSpawn.sync) {
  if (step.type !== 'node') return
  const actualHash = await sha256File(step.executablePath)
  if (actualHash !== step.expectedExecutableSha256) {
    throw new Error(
      `node runtime executable checksum mismatch: ${actualHash} != ${step.expectedExecutableSha256}`
    )
  }

  if (step.platform !== process.platform || step.arch !== process.arch) return

  const versionResult = spawn(step.executablePath, ['--version'], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true
  })
  if (versionResult.error || versionResult.status !== 0) {
    throw new Error('Installed node runtime could not report its version', {
      cause: versionResult.error
    })
  }
  if (String(versionResult.stdout).trim() !== step.version) {
    throw new Error(
      `Installed node runtime version mismatch: ${String(versionResult.stdout).trim()} != ${step.version}`
    )
  }
}

const windowsUvFiles = new Set(['uv.exe', 'uvx.exe', 'uvw.exe'])
const windowsZipRuntimeTypes = new Set(['node', 'uv', 'rtk'])

export function windowsRuntimeArchive(step) {
  if (step.platform !== 'win32') {
    throw new Error(`Windows runtime archive is only for win32, received ${step.platform}`)
  }
  if (step.type === 'uv') {
    const triple = step.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
    return {
      kind: 'uv',
      url: `https://github.com/astral-sh/uv/releases/download/${step.version}/uv-${triple}.zip`
    }
  }
  if (step.type === 'node') {
    const platformId = step.arch === 'arm64' ? 'win-arm64' : 'win-x64'
    return {
      kind: 'node',
      url: `https://nodejs.org/dist/${step.version}/node-${step.version}-${platformId}.zip`
    }
  }
  if (step.type === 'rtk') {
    if (step.arch !== 'x64') {
      throw new Error(`rtk runtime is only published for win32-x64, received win32-${step.arch}`)
    }
    return {
      kind: 'rtk',
      url: `https://github.com/rtk-ai/rtk/releases/download/${step.version}/rtk-x86_64-pc-windows-msvc.zip`
    }
  }
  throw new Error(`Windows zip install does not handle ${step.type}`)
}

function stepTargetDir(step) {
  const index = step.args.indexOf('--dir')
  const targetDir = step.args[index + 1]
  if (index === -1 || !targetDir) {
    throw new Error(`Runtime step ${step.type} is missing --dir`)
  }
  return targetDir
}

function isSafeZipPath(name) {
  if (!name || name.startsWith('/') || name.includes(':')) return false
  return !name.split('/').includes('..')
}

export function windowsRuntimeFiles(entries, kind) {
  const files = Object.entries(entries)
    .map(([name, data]) => ({ name: name.replaceAll('\\', '/'), data }))
    .filter((entry) => entry.name && !entry.name.endsWith('/') && isSafeZipPath(entry.name))

  if (kind === 'uv') {
    const selected = new Map()
    for (const entry of files) {
      const base = entry.name.split('/').pop()
      if (!windowsUvFiles.has(base)) continue
      const current = selected.get(base)
      if (!current || entry.name.length < current.name.length) selected.set(base, entry)
    }
    return [...selected.values()].map((entry) => ({
      relative: entry.name.split('/').pop(),
      data: entry.data
    }))
  }

  if (kind === 'rtk') {
    const rtkExe = files
      .filter((entry) => entry.name.split('/').pop() === 'rtk.exe')
      .sort((left, right) => left.name.split('/').length - right.name.split('/').length)[0]
    if (!rtkExe) return []
    return [{ relative: 'rtk.exe', data: rtkExe.data }]
  }

  const nodeExe = files
    .filter((entry) => entry.name.split('/').pop() === 'node.exe')
    .sort((left, right) => left.name.split('/').length - right.name.split('/').length)[0]
  if (!nodeExe) return []
  const slash = nodeExe.name.lastIndexOf('/')
  const root = slash === -1 ? '' : nodeExe.name.slice(0, slash + 1)
  return files
    .filter((entry) => entry.name.startsWith(root))
    .map((entry) => ({ relative: entry.name.slice(root.length), data: entry.data }))
}

export async function extractWindowsRuntimeZip(bytes, targetDir, kind) {
  const entries = unzipSync(bytes)
  const files = windowsRuntimeFiles(entries, kind)
  const requiredByKind = {
    node: ['node.exe'],
    rtk: ['rtk.exe'],
    uv: ['uv.exe', 'uvx.exe']
  }
  const required = requiredByKind[kind]
  if (!required) throw new Error(`Windows zip install does not handle ${kind}`)
  const present = new Set(files.map((file) => path.posix.basename(file.relative)))
  const missing = required.filter((name) => !present.has(name))
  if (missing.length > 0) {
    const sample = Object.keys(entries).slice(0, 8).join(', ') || '(empty)'
    throw new Error(
      `Windows ${kind} archive is missing ${missing.join(', ')}. Archive entries: ${sample}`
    )
  }

  const stagingDir = `${targetDir}.extracting`
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })
  for (const file of files) {
    const destination = path.join(stagingDir, file.relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, file.data)
  }
  await rm(targetDir, { recursive: true, force: true })
  await rename(stagingDir, targetDir)
}

export async function installWindowsZipRuntime(step, fetchImpl = globalThis.fetch) {
  const archive = windowsRuntimeArchive(step)
  const targetDir = stepTargetDir(step)
  console.log(`Downloading Windows ${step.type} runtime: ${archive.url}`)
  const response = await fetchImpl(archive.url)
  if (!response.ok) {
    throw new Error(`Failed to download ${archive.url}: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  await extractWindowsRuntimeZip(bytes, targetDir, archive.kind)
  console.log(`Extracted Windows ${step.type} runtime to ${targetDir}`)
}

export async function runRuntimeInstallPlan(
  plan,
  spawn = crossSpawn.sync,
  verify = verifyInstalledRuntime,
  options = {}
) {
  const hostPlatform = options.hostPlatform ?? process.platform
  const installZip = options.installWindowsZipRuntime ?? installWindowsZipRuntime
  for (const step of plan) {
    if (
      hostPlatform === 'win32' &&
      step.platform === 'win32' &&
      windowsZipRuntimeTypes.has(step.type)
    ) {
      await installZip(step)
      await verify(step)
      continue
    }
    const result = spawn(step.command, step.args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit'
    })
    if (result.error) {
      throw new Error(`Failed to start ${step.type} runtime installer`, { cause: result.error })
    }
    if (result.status !== 0) {
      const termination = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`
      throw new Error(`${step.type} runtime installation failed with ${termination}`)
    }
    await verify(step)
  }
}

function formatDryRunStep(step) {
  return [step.command, ...step.args].map((part) => JSON.stringify(part)).join(' ')
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseRuntimeInstallArgs(argv)
  const plan = buildRuntimeInstallPlan({
    platform: options.platform ?? process.platform,
    arch: options.arch ?? process.arch,
    types: options.types,
    rootDir: options['root-dir'] ? path.resolve(options['root-dir']) : repositoryRoot
  })

  if (options.dryRun) {
    for (const step of plan) console.log(formatDryRunStep(step))
    return
  }

  await runRuntimeInstallPlan(plan)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
