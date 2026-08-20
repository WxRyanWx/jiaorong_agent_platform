import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** Sealed payload prefix. Plaintext and other providers pass through unchanged. */
export const BUILTIN_SECRET_PREFIX = 'jrk1'

function wrappingKey(): Buffer {
  return createHash('sha256')
    .update(['JiaorongAI', 'builtin-provider', 'aes-256-gcm', 'v1'].join('\0'))
    .digest()
}

export function sealBuiltinSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', wrappingKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    BUILTIN_SECRET_PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join('.')
}

export function revealBuiltinSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parts = trimmed.split('.')
  if (parts[0] !== BUILTIN_SECRET_PREFIX) return trimmed
  if (parts.length !== 4) return ''
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      wrappingKey(),
      Buffer.from(parts[1], 'base64url')
    )
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final()
    ]).toString('utf8')
  } catch {
    return ''
  }
}
