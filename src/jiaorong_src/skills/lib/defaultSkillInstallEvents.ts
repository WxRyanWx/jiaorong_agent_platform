/**
 * 默认技能静默安装进度（供技能市场 UI 合并「安装中」态）。
 */

export const JIAORONG_DEFAULT_SKILL_INSTALL_EVENT = 'jiaorong:default-skill-install'

export type DefaultSkillInstallEventDetail = {
  marketName: string
  phase: 'start' | 'end'
}

const installingMarketNames = new Set<string>()

export function getDefaultSkillsInstallingNames(): string[] {
  return Array.from(installingMarketNames)
}

export function emitDefaultSkillInstallPhase(marketName: string, phase: 'start' | 'end'): void {
  const name = marketName.trim()
  if (!name) return
  if (phase === 'start') {
    installingMarketNames.add(name)
  } else {
    installingMarketNames.delete(name)
  }
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DefaultSkillInstallEventDetail>(JIAORONG_DEFAULT_SKILL_INSTALL_EVENT, {
      detail: { marketName: name, phase }
    })
  )
}
