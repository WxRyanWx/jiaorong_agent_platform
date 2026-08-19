export const LEGACY_QUESTION_TOOL_NAME = 'deepchat_question'
export const LEGACY_CHAT_SETTINGS_SKILL_NAME = 'deepchat-settings'
export const LEGACY_CLI_SKILL_NAME = 'deepchat-cli'
export const CURRENT_QUESTION_TOOL_NAME = 'jiaorong_question'
export const CURRENT_CHAT_SETTINGS_SKILL_NAME = 'jiaorong-settings'
export const CURRENT_CLI_SKILL_NAME = 'jiaorong-cli'
export const CHAT_SETTINGS_SKILL_NAME = CURRENT_CHAT_SETTINGS_SKILL_NAME

const LEGACY_SKILL_NAME_ALIASES: Record<string, string> = {
  [LEGACY_CHAT_SETTINGS_SKILL_NAME]: CURRENT_CHAT_SETTINGS_SKILL_NAME,
  [LEGACY_CLI_SKILL_NAME]: CURRENT_CLI_SKILL_NAME
}

const LEGACY_TOOL_NAME_ALIASES: Record<string, string> = {
  [LEGACY_QUESTION_TOOL_NAME]: CURRENT_QUESTION_TOOL_NAME,
  deepchat_settings_toggle: 'jiaorong_settings_toggle',
  deepchat_settings_set_language: 'jiaorong_settings_set_language',
  deepchat_settings_set_theme: 'jiaorong_settings_set_theme',
  deepchat_settings_set_font_size: 'jiaorong_settings_set_font_size',
  deepchat_settings_open: 'jiaorong_settings_open'
}

export const resolveLegacyToolName = (toolName: string): string => {
  return LEGACY_TOOL_NAME_ALIASES[toolName] ?? toolName
}

export const resolveLegacySkillName = (skillName: string): string => {
  return LEGACY_SKILL_NAME_ALIASES[skillName] ?? skillName
}

export const getLegacyToolAliasNames = (canonicalName: string): string[] => {
  return Object.entries(LEGACY_TOOL_NAME_ALIASES)
    .filter(([, canonical]) => canonical === canonicalName)
    .map(([legacyName]) => legacyName)
}

export const getLegacySkillAliasNames = (canonicalName: string): string[] => {
  return Object.entries(LEGACY_SKILL_NAME_ALIASES)
    .filter(([, canonical]) => canonical === canonicalName)
    .map(([legacyName]) => legacyName)
}
