/**
 * 侧栏贡献的同步读取（不依赖 idle mountJiaorong）。
 * 技能入口须在首屏即可点，故不可等 requestIdleCallback。
 */
import type { JiaorongSidebarItem, JiaorongSidebarSlot } from './types'
import { BUILTIN_MODULES } from './modules'
import { isSkillRouteLocation } from '../skills/routes'

export function listJiaorongSidebarItems(
  slot: JiaorongSidebarSlot = 'after-deepchat'
): JiaorongSidebarItem[] {
  return BUILTIN_MODULES.flatMap((module) => module.sidebarItems ?? [])
    .filter((item) => (item.slot ?? 'after-deepchat') === slot)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** 当前路由是否应隐藏会话栏等宿主 chrome（技能中心等） */
export function isJiaorongExclusiveChromeRoute(routeName: unknown, routePath?: string): boolean {
  // 技能中心：路径/name 双判定（与历史 isSkillRouteLocation 一致）
  if (isSkillRouteLocation(routeName, routePath ?? '')) {
    return true
  }

  const exclusiveNames = new Set(
    BUILTIN_MODULES.flatMap((module) => module.sidebarItems ?? [])
      .filter((item) => item.exclusiveChrome)
      .map((item) => item.routeName)
  )
  return typeof routeName === 'string' && exclusiveNames.has(routeName)
}
