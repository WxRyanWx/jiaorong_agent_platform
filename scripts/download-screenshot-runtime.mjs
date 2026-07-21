import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
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
rmSync(output, { force: true })
await pipeline(Readable.fromWeb(response.body), createWriteStream(output))
process.stdout.write(`Downloaded ${repository}@${version}/${asset}\n`)
