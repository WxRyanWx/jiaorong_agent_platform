import type { JiaorongHostPorts, JiaorongModule, JiaorongRegistry } from './types'
import { BUILTIN_MODULES } from './modules'

function buildRegistry(modules: JiaorongModule[]): JiaorongRegistry {
  return {
    modules,
    sidebarItems: modules.flatMap((m) => m.sidebarItems ?? []),
    routes: modules.flatMap((m) => m.routes ?? [])
  }
}

let mounted = false
let registry: JiaorongRegistry | null = null

/**
 * 交融私有模块的唯一挂载入口。
 * 请在应用 mount 之后、空闲时调用，勿放在路由模块顶层同步执行。
 */
export function mountJiaorong(_host?: JiaorongHostPorts): JiaorongRegistry {
  if (mounted && registry) {
    return registry
  }
  registry = buildRegistry(BUILTIN_MODULES)
  mounted = true
  if (import.meta.env.DEV) {
    console.info(
      '[jiaorong_src] 已挂载模块:',
      registry.modules.map((m) => m.id).join(', ') || '(无)'
    )
  }
  return registry
}

export function getJiaorongRegistry(): JiaorongRegistry | null {
  return registry
}
