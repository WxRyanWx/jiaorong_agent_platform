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
  // 启动时尝试补装；chat / 技能页路由再兜底（已登录直进 chat 也能静默补全）
  void import('../skills/lib/ensureDefaultSkills').then(
    ({ scheduleEnsureDefaultSkills, setupDefaultSkillsSeedRouteTriggers }) => {
      scheduleEnsureDefaultSkills()
      void import('@/router')
        .then((mod) => {
          const router = mod.default
          if (router) setupDefaultSkillsSeedRouteTriggers(router)
        })
        .catch(() => undefined)
    }
  )
  return registry
}

export function getJiaorongRegistry(): JiaorongRegistry | null {
  return registry
}
