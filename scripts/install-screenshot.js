import { execSync } from 'node:child_process'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __fileName = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fileName);

const GITHUB_REPO = 'yanxia1999/screenshot-electron';
const RELEASE_TAG = 'v0.1.3';
const TARGET_DIR = path.resolve(__dirname, '../src/jiaorong_src/process/screenshot/resources/screenshot-runtime');

function getFirstZipFileName() {
  const { platform, arch } = process
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-macOS-arm64.zip'
      : 'jiaorong-screenshot-macOS-x64.zip';
  }
  if(platform === 'win32') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-Windows-arm64.zip'
      : 'jiaorong-screenshot-Windows-x64.zip';
  }
  if (platform === 'linux') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-Linux-arm64.zip'
      : 'jiaorong-screenshot-Linux-x64.zip';
    }
  throw new Error(`Not support platform: ${platform} - ${arch}`);
}

function getSecondZipFileName() {
  const { platform, arch } = process
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-mac-arm64.zip'
      : 'jiaorong-screenshot-mac-x64.zip';
  }
  if(platform === 'win32') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-Windows-arm64.zip'
      : 'jiaorong-screenshot-Windows-x64.zip';
  }
  if (platform === 'linux') {
    return arch === 'arm64'
      ? 'jiaorong-screenshot-Linux-arm64.zip'
      : 'jiaorong-screenshot-Linux-x64.zip';
  }
  throw new Error(`Not support platform: ${platform} - ${arch}`);
}

function setExecutablePermission(dirPath)
{
  if(process.platform === 'win32') return;

  const entries = fs.readdirSync(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      setExecutablePermission(fullPath);
    }
    else
    {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}

async function main() {
  const assetName = getFirstZipFileName();
  console.log(`Download screenshot asset: ${assetName}`);
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true});

  const cmd = [
    'gh',
    'release',
    'download',
    RELEASE_TAG,
    '--repo',
    GITHUB_REPO,
    '--pattern',
    assetName,
    '--dir',
    TARGET_DIR
  ].join(' ');

  console.log('Start Download', cmd);
  try {
    execSync(cmd, { stdio: 'inherit'});
    console.log(`Screenshot asset download to ${TARGET_DIR}`);
  } catch (err) {
    console.error('Download screenshot failed', err.message);
    process.exit(1);
  }

  const tempZip = path.join(TARGET_DIR, assetName);
  if(process.platform === 'darwin' || process.platform === 'linux') {
    execSync(`unzip -o "${tempZip}" -d "${TARGET_DIR}"`, {
      stdio: 'inherit'
    });
  }
  else if(process.platform === 'win32') {
    execSync(`tar -xf "${tempZip}" -C "${TARGET_DIR}"`, {
      stdio: 'inherit'
    });
  }
  console.log(`Unzip first screenshot asset`);

  fs.unlinkSync(tempZip);

  if(process.platform === 'darwin' || process.platform === 'linux') {
    const secondZipName = getSecondZipFileName();
    const secondZip = path.join(TARGET_DIR, secondZipName);
    execSync(`unzip -o "${secondZip}" -d "${TARGET_DIR}"`, {
      stdio: 'inherit'
    });
    console.log(`Unzip second screenshot asset`);

    fs.unlinkSync(secondZip);
  }

  setExecutablePermission(TARGET_DIR);
  console.log(`Screenshot asset Ready: ${TARGET_DIR}`);
}

main().catch((err) => {
  console.error('Download screenshot failed', err.message);
  process.exit(1);
});


