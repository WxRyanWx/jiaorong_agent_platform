import {
  startGeneralChatWithSkills,
  type StartGeneralChatWithSkillsOptions
} from './startGeneralChatWithSkills'
import { openSkillFolder, readSkillMarkdown, uninstallSkill } from './skillFileOperations'
import { showGlobalSuccessToast, type GlobalSuccessToastOptions } from './globalToast'

export type { GlobalSuccessToastOptions, StartGeneralChatWithSkillsOptions }
export type {
  SkillSwitchResult,
  SetSkillSwitchOptions,
  SkillSwitchEventDetail
} from './skillSwitch'

export { isSkillInstalled, isSkillInstalledAsync } from './skillInstall'
export {
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
  JIAORONG_SKILL_SWITCH_STORAGE_KEY,
  JIAORONG_SKILL_SWITCH_SETTING_KEY,
  JIAORONG_SKILL_SWITCH_EVENT
} from './skillSwitch'
