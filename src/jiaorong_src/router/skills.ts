import type { RouteRecordRaw } from 'vue-router'
import { SKILL_ROUTE_DEFS } from './skills.meta'

export function createSkillRoutes(): RouteRecordRaw[] {
  const listMeta = SKILL_ROUTE_DEFS.find((route) => route.name === 'skills')
  const connectorsMeta = SKILL_ROUTE_DEFS.find((route) => route.name === 'skills-connectors')
  const connectorOcrMeta = SKILL_ROUTE_DEFS.find((route) => route.name === 'skills-connector-ocr')
  const connectorDetailMeta = SKILL_ROUTE_DEFS.find(
    (route) => route.name === 'skills-connector-detail'
  )
  const mcpMeta = SKILL_ROUTE_DEFS.find((route) => route.name === 'skills-mcp')
  const detailMeta = SKILL_ROUTE_DEFS.find((route) => route.name === 'skills-detail')
  if (
    !listMeta ||
    !connectorsMeta ||
    !connectorOcrMeta ||
    !connectorDetailMeta ||
    !mcpMeta ||
    !detailMeta
  ) {
    throw new Error('[jiaorong] plugin center route defs are incomplete')
  }

  return [
    {
      path: '/skills',
      component: () => import('../plugins/PluginCenterPage.vue'),
      meta: {
        titleKey: listMeta.titleKey,
        icon: 'lucide:puzzle'
      },
      children: [
        {
          path: '',
          name: listMeta.name,
          component: () => import('../skills/pages/SkillListPage/SkillListPage.vue'),
          meta: {
            titleKey: listMeta.titleKey,
            icon: 'lucide:wand-sparkles'
          }
        },
        {
          path: 'connectors',
          name: connectorsMeta.name,
          component: () => import('@/pages/plugins/PluginsCatalogPage.vue'),
          meta: {
            titleKey: connectorsMeta.titleKey,
            icon: 'lucide:puzzle'
          }
        },
        {
          path: 'connectors/builtin/ocr',
          name: connectorOcrMeta.name,
          component: () => import('@/pages/plugins/OcrPluginsPage.vue'),
          meta: {
            titleKey: connectorOcrMeta.titleKey,
            icon: 'lucide:scan-text'
          }
        },
        {
          path: 'connectors/:pluginId',
          name: connectorDetailMeta.name,
          component: () => import('@/pages/plugins/OfficialPluginDetailPage.vue'),
          meta: {
            titleKey: connectorDetailMeta.titleKey,
            icon: 'lucide:puzzle'
          }
        },
        {
          path: 'mcp',
          name: mcpMeta.name,
          component: () => import('@/pages/plugins/McpPluginsPage.vue'),
          meta: {
            titleKey: mcpMeta.titleKey,
            icon: 'lucide:server'
          }
        },
        {
          path: ':skillId',
          name: detailMeta.name,
          component: () => import('../skills/pages/SkillDetailPage/SkillDetailPage.vue'),
          meta: {
            titleKey: detailMeta.titleKey,
            icon: 'lucide:wand-sparkles'
          }
        }
      ]
    }
  ]
}

export {
  SKILL_ROUTE_DEFS,
  SKILL_ROUTE_NAMES,
  isSkillRouteLocation,
  type SkillRouteName
} from './skills.meta'
