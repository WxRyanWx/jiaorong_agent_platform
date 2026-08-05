/**
 * 侧栏贡献的同步读取（不依赖 idle mountJiaorong）。
 * 技能入口须在首屏即可点，故不可等 requestIdleCallback。
 */
import type { JiaorongSidebarItem, JiaorongSidebarSlot } from './types'
import { BUILTIN_MODULES } from './modules'
import { isKnowledgeBaseRouteLocation } from '../router/knowledgeBase.meta'
import { isSkillRouteLocation } from '../router/skills.meta'

export function listJiaorongSidebarItems(
  slot: JiaorongSidebarSlot = 'after-deepchat'
): JiaorongSidebarItem[] {
  return BUILTIN_MODULES.flatMap((module) => module.sidebarItems ?? [])
    .filter((item) => (item.slot ?? 'after-deepchat') === slot)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** 当前路由是否应隐藏会话栏等宿主 chrome（技能中心、知识库等） */
export function isJiaorongExclusiveChromeRoute(routeName: unknown, routePath?: string): boolean {
  const path = routePath ?? ''
  // 技能中心 / 知识库：路径/name 双判定（详情子路或刷新后 name 暂缺时仍可靠）
  if (isSkillRouteLocation(routeName, path) || isKnowledgeBaseRouteLocation(routeName, path)) {
    return true
  }

  const exclusiveNames = new Set(
    BUILTIN_MODULES.flatMap((module) => module.sidebarItems ?? [])
      .filter((item) => item.exclusiveChrome)
      .map((item) => item.routeName)
  )
  return typeof routeName === 'string' && exclusiveNames.has(routeName)
}
