import { resolveAuthApiOrigin } from '../auth/config'

/** 与 auth origin 同源：`{origin}/api/ai-mcp/knowledge-base` */
export function resolveKnowledgeBaseMcpUrl(): string {
  return `${resolveAuthApiOrigin()}/api/ai-mcp/knowledge-base`
}
