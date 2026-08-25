import { resolveAuthApiOrigin } from '../auth/config'

/** 与 auth origin 同源：`{origin}/api/knowledge-base/mcp` */
export function resolveKnowledgeBaseMcpUrl(): string {
  return `${resolveAuthApiOrigin()}/api/knowledge-base/mcp`
}
