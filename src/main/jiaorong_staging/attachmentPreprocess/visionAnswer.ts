/**
 * Prefer final answer text only.
 * Do not fall back to reasoning/CoT — keyword sanitizers are not a safety boundary.
 */
export function pickVisionDescription(text: string, _reasoning: string): string {
  return text.trim()
}
