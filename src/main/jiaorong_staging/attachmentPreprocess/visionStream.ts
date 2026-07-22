import type { LLMCoreStreamEvent } from '@shared/types/core/llm-events'
import { pickVisionDescription } from './visionAnswer'

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError')
  }
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Consume a provider coreStream for vision describe.
 * Prefer answer text only; race AbortSignal and call stream.return when cancelled.
 */
export async function consumeVisionCoreStream(
  stream: AsyncGenerator<LLMCoreStreamEvent>,
  options: {
    throwIfAborted: () => void
    signal?: AbortSignal
    onAnswerDelta?: (chunk: string, accumulatedAnswer: string) => void
  }
): Promise<string> {
  let answerText = ''
  let reasoningText = ''

  const collect = async () => {
    for await (const event of stream) {
      options.throwIfAborted()
      if (options.signal?.aborted) {
        throw createAbortError()
      }
      if (event.type === 'text' && event.content) {
        answerText += event.content
        options.onAnswerDelta?.(event.content, answerText)
      } else if (event.type === 'reasoning' && event.reasoning_content) {
        reasoningText += event.reasoning_content
      } else if (event.type === 'error') {
        throw new Error(event.error_message || 'Vision stream error')
      }
    }
  }

  if (!options.signal) {
    await collect()
    return pickVisionDescription(answerText, reasoningText)
  }

  if (options.signal.aborted) {
    throw createAbortError()
  }

  let settled = false
  let onAbort: (() => void) | null = null
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      void stream.return?.(undefined as never)
      reject(createAbortError())
    }
    options.signal!.addEventListener('abort', onAbort, { once: true })
  })

  const collectPromise = collect().catch((error) => {
    // Losing race after abort must not surface as an unhandled rejection.
    if (settled && isAbortError(error)) {
      return
    }
    if (options.signal?.aborted && isAbortError(error)) {
      return
    }
    throw error
  })

  try {
    await Promise.race([collectPromise, abortPromise])
    settled = true
  } catch (error) {
    settled = true
    throw error
  } finally {
    settled = true
    if (onAbort) {
      options.signal.removeEventListener('abort', onAbort)
    }
  }

  if (options.signal.aborted) {
    throw createAbortError()
  }

  return pickVisionDescription(answerText, reasoningText)
}
