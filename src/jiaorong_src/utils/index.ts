import {
  startGeneralChatWithSkills,
  type StartGeneralChatWithSkillsOptions
} from './startGeneralChatWithSkills'
import {
  isMissingSkillManifestError,
  openSkillFolder,
  readSkillMarkdown,
  uninstallSkill
} from './skillFileOperations'
import { showGlobalSuccessToast, type GlobalSuccessToastOptions } from './globalToast'

export type { GlobalSuccessToastOptions, StartGeneralChatWithSkillsOptions }
export type {
  SkillSwitchResult,
  SetSkillSwitchOptions,
  SkillSwitchEventDetail
} from './skillSwitch'
export type { InstallSkillFromZipUrlResult } from './downloadSkill'

export { isSkillInstalled, isSkillInstalledAsync } from './skillInstall'
export { installSkillFromZipUrl, confirmSkillOverwrite } from './downloadSkill'
export { refreshSkillsCatalog } from './refreshSkillsCatalog'
export {
  isMissingSkillManifestError,
  openSkillFolder,
  readSkillMarkdown,
  showGlobalSuccessToast,
  startGeneralChatWithSkills,
  uninstallSkill
}
export {
  SkillSwitchStatus,
  getSkillSwitchStatus,
  setSkillSwitchStatus,
  enableSkill,
  disableSkill,
  isSkillSwitchOn,
  filterEnabledSkillNames,
  filterEnabledSkills,
  filterEnabledSkillNamesFromSetting,
  ensureSkillSwitchHydrated,
  JIAORONG_SKILL_SWITCH_STORAGE_KEY,
  JIAORONG_SKILL_SWITCH_SETTING_KEY,
  JIAORONG_SKILL_SWITCH_EVENT
} from './skillSwitch'
