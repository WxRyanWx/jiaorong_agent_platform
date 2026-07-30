import { createWriteStream, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}
const platform = readArg('--platform', process.platform)
const arch = readArg('--arch', process.arch)
const version = readArg('--version', process.env.SCREENSHOT_RUNTIME_VERSION || 'v0.1.1')
const repository = readArg('--repo', process.env.SCREENSHOT_RUNTIME_REPOSITORY || 'yanxia1999/screenshot-electron')
const names = {
  'darwin-arm64': 'jiaorong-screenshot-macOS-arm64.zip',
  'darwin-x64': 'jiaorong-screenshot-macOS-x64.zip',
  'win32-arm64': 'jiaorong-screenshot-Windows-arm64.zip',
  'win32-x64': 'jiaorong-screenshot-Windows-x64.zip',
  'linux-arm64': 'jiaorong-screenshot-Linux-arm64.zip',
  'linux-x64': 'jiaorong-screenshot-Linux-x64.zip'
}
const asset = names[`${platform}-${arch}`]
if (!asset) throw new Error(`Unsupported screenshot runtime target: ${platform}-${arch}`)
const token = process.env.SCREENSHOT_REPO_TOKEN || process.env.GH_TOKEN
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
}
const releaseResponse = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(version)}`, { headers })
if (!releaseResponse.ok) throw new Error(`Unable to read release ${version}: HTTP ${releaseResponse.status}`)
const release = await releaseResponse.json()
const releaseAsset = release.assets?.find((item) => item.name === asset)
if (!releaseAsset) throw new Error(`Release ${version} does not contain ${asset}`)
const response = await fetch(releaseAsset.url, { headers: { ...headers, Accept: 'application/octet-stream' }, redirect: 'follow' })
if (!response.ok || !response.body) throw new Error(`Unable to download ${asset}: HTTP ${response.status}`)
const destination = resolve('build', 'screenshot-download')
mkdirSync(destination, { recursive: true })
const output = join(destination, asset)
const partial = `${output}.part`
const contentLength = Number(response.headers.get('content-length')) || 0
let downloaded = 0
let lastProgressAt = 0
const progress = new Transform({
  transform(chunk, _encoding, callback) {
    downloaded += chunk.length
    const now = Date.now()
    if (now - lastProgressAt >= 1000) {
      const total = contentLength ? ` / ${(contentLength / 1024 / 1024).toFixed(1)} MB` : ''
      process.stderr.write(`\rDownloading ${asset}: ${(downloaded / 1024 / 1024).toFixed(1)} MB${total}`)
      lastProgressAt = now
    }
    callback(null, chunk)
  }
})
rmSync(partial, { force: true })
try {
  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partial))
  const actualSize = statSync(partial).size
  if (contentLength && actualSize !== contentLength) {
    throw new Error(`Incomplete download for ${asset}: expected ${contentLength} bytes, received ${actualSize}`)
  }
  const archiveCheck = spawnSync('tar', ['-tf', partial], { encoding: 'utf8' })
  if (archiveCheck.status !== 0) {
    throw new Error(`Downloaded archive is invalid: ${archiveCheck.stderr.trim()}`)
  }
  rmSync(output, { force: true })
  renameSync(partial, output)
  process.stderr.write('\n')
} catch (error) {
  rmSync(partial, { force: true })
  process.stderr.write('\n')
  throw error
}
process.stdout.write(`Downloaded ${repository}@${version}/${asset}\n`)
