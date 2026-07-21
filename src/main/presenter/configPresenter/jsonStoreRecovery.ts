import fs from 'fs'
import path from 'path'

export type QuarantineJsonResult = {
  quarantined: boolean
  filePath: string
  backupPath?: string
  reason?: string
}

/**
 * If `filePath` exists but is not valid JSON, rename it to a timestamped backup
 * so electron-store / conf can recreate defaults instead of throwing SyntaxError
 * and aborting critical startup hooks (white screen).
 */
export function quarantineInvalidJsonFile(filePath: string): QuarantineJsonResult {
  if (!fs.existsSync(filePath)) {
    return { quarantined: false, filePath }
  }

  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    return {
      quarantined: false,
      filePath,
      reason: error instanceof Error ? error.message : String(error)
    }
  }

  try {
    JSON.parse(raw)
    return { quarantined: false, filePath }
  } catch (error) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${filePath}.corrupt-${stamp}`
    const reason = error instanceof Error ? error.message : String(error)

    try {
      fs.renameSync(filePath, backupPath)
    } catch {
      fs.copyFileSync(filePath, backupPath)
      fs.unlinkSync(filePath)
    }

    console.error(
      `[Config] Quarantined corrupt JSON store: ${filePath} -> ${backupPath} (${reason})`
    )

    return { quarantined: true, filePath, backupPath, reason }
  }
}

/** Resolve `<cwd>/<name>.json` and quarantine it when parse fails. */
export function prepareJsonStoreFile(
  cwd: string,
  name: string,
  fileExtension = 'json'
): QuarantineJsonResult {
  const extension = fileExtension ? `.${fileExtension}` : ''
  const filePath = path.join(cwd, `${name}${extension}`)
  return quarantineInvalidJsonFile(filePath)
}
