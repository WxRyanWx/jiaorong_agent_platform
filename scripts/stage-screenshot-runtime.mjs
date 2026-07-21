import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}
const platform = readArg('--platform', process.platform)
const arch = readArg('--arch', process.arch)
const names = {
  'darwin-arm64': 'jiaorong-screenshot-macOS-arm64.zip', 'darwin-x64': 'jiaorong-screenshot-macOS-x64.zip',
  'win32-arm64': 'jiaorong-screenshot-Windows-arm64.zip', 'win32-x64': 'jiaorong-screenshot-Windows-x64.zip',
  'linux-arm64': 'jiaorong-screenshot-Linux-arm64.zip', 'linux-x64': 'jiaorong-screenshot-Linux-x64.zip'
}
const asset = names[`${platform}-${arch}`]
if (!asset) throw new Error(`Unsupported screenshot runtime target: ${platform}-${arch}`)
const root = resolve(import.meta.dirname, '..')
const archive = join(root, 'build', 'screenshot-download', asset)
if (!existsSync(archive)) throw new Error(`Missing ${asset}; run screenshot:download first`)
const stage = join(root, 'build', 'screenshot-runtime')
const temporary = mkdtempSync(join(tmpdir(), 'screenshot-stage-'))
const extract = (source, destination, gzip = false) => {
  const result = spawnSync('tar', [gzip ? '-xzf' : '-xf', source, '-C', destination], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
}
const find = (directory, predicate) => {
  const pending = [directory]
  while (pending.length) {
    const current = pending.shift()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (predicate(path, entry)) return path
      if (entry.isDirectory() && !entry.name.endsWith('.app')) pending.push(path)
    }
  }
  return null
}
try {
  const outer = join(temporary, 'outer')
  mkdirSync(outer)
  extract(archive, outer)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  if (platform === 'win32') {
    const executable = find(outer, (path, entry) => entry.isFile() && path.endsWith('.exe'))
    if (!executable) throw new Error(`No Windows executable in ${asset}`)
    cpSync(executable, join(stage, 'jiaorong-screenshot.exe'))
  } else if (platform === 'darwin') {
    const innerZip = find(outer, (path, entry) => entry.isFile() && path.endsWith('.zip'))
    const inner = join(temporary, 'inner')
    mkdirSync(inner)
    if (innerZip) extract(innerZip, inner)
    const appBundle = find(innerZip ? inner : outer, (path, entry) => entry.isDirectory() && path.endsWith('.app'))
    if (!appBundle) throw new Error(`No macOS application in ${asset}`)
    cpSync(appBundle, join(stage, 'JiaorongScreenshot.app'), {
      recursive: true,
      verbatimSymlinks: true
    })
  } else {
    const tarball = find(outer, (path, entry) => entry.isFile() && path.endsWith('.tar.gz'))
    if (!tarball) throw new Error(`No Linux tarball in ${asset}`)
    const inner = join(temporary, 'inner')
    mkdirSync(inner)
    extract(tarball, inner, true)
    const executable = find(inner, (path, entry) => entry.isFile() && basename(path) === 'jiaorong-screenshot')
    if (!executable) throw new Error(`No Linux executable in ${asset}`)
    for (const entry of readdirSync(dirname(executable))) {
      cpSync(join(dirname(executable), entry), join(stage, entry), {
        recursive: true,
        verbatimSymlinks: true
      })
    }
  }
  process.stdout.write(`Staged screenshot runtime ${platform}-${arch}\n`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
