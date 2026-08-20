import { stdin as stdinStream } from 'node:process'
import { sealBuiltinSecret } from '../builtinSecret.ts'

async function readPlaintext(): Promise<string> {
  const fromArg = process.argv[2]?.trim()
  if (fromArg) return fromArg
  const fromEnv = process.env.JIAORONG_BUILTIN_API_KEY?.trim()
  if (fromEnv) return fromEnv
  if (stdinStream.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of stdinStream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

const plain = await readPlaintext()
if (!plain) {
  console.error(
    'Usage: node src/jiaorong_src/provider/scripts/seal-builtin-secret.mjs <plaintext>\n' +
      '   or: JIAORONG_BUILTIN_API_KEY=... node src/jiaorong_src/provider/scripts/seal-builtin-secret.mjs\n' +
      '   or: printf %s "$KEY" | node src/jiaorong_src/provider/scripts/seal-builtin-secret.mjs'
  )
  process.exit(1)
}

process.stdout.write(`${sealBuiltinSecret(plain)}\n`)
