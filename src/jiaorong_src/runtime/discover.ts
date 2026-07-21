import type { JiaorongHostPorts, JiaorongModule, JiaorongRegistry } from './types'

/**
 * 显式引入已知模块，避免 import.meta.glob({ eager: true }) 在首屏同步扫盘/求值。
 * 新增模块时在此追加一行 import 即可。
 */
import authModule from '../auth/module'
import skillsModule from '../skills/module'

const BUILTIN_MODULES: JiaorongModule[] = [authModule, skillsModule]

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
