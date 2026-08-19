import { z } from 'zod'
import { toDeepChatJsonSchema } from '@shared/lib/zodJsonSchema'
import type {
  ApplyChatSettingResult,
  ChatSettingValue,
  ChatLanguage,
  OpenChatSettingsResult,
  OpenChatSettingsSection
} from '@shared/types/chatSettings'
import type { SkillServicePort } from '@shared/types/skill'
import { TOOL_EXECUTION, type MCPToolDefinition } from '@shared/types/mcp'
import type { AgentDesktopToolPort, AgentDisplaySettingsPort } from '../runtimePorts'
import type { SkillSettingsPort } from '@/skill/settings'
import { REQUESTED_LOCALES } from '@shared/locales'

import { CHAT_SETTINGS_SKILL_NAME, resolveLegacySkillName } from '@shared/legacyBrandAliases'

export { CHAT_SETTINGS_SKILL_NAME }
export const CHAT_SETTINGS_TOOL_NAMES = {
  toggle: 'jiaorong_settings_toggle',
  setLanguage: 'jiaorong_settings_set_language',
  setTheme: 'jiaorong_settings_set_theme',
  setFontSize: 'jiaorong_settings_set_font_size',
  open: 'jiaorong_settings_open'
} as const

const SUPPORTED_THEMES = ['dark', 'light', 'system'] as const

const FONT_SIZE_LEVELS = [0, 1, 2, 3, 4] as const

const toggleSchema = z.strictObject({
  setting: z.enum(['copyWithCotEnabled']).describe('Toggle setting id.'),
  enabled: z.boolean().describe('Enable or disable the setting.')
})

const languageSchema = z.strictObject({
  language: z.enum(REQUESTED_LOCALES).describe('JiaorongAI language/locale.')
})

const themeSchema = z.strictObject({
  theme: z.enum(SUPPORTED_THEMES).describe('Theme mode for JiaorongAI.')
})

const fontSizeSchema = z.strictObject({
  level: z
    .union(
      FONT_SIZE_LEVELS.map((value) => z.literal(value)) as [
        z.ZodLiteral<0>,
        z.ZodLiteral<1>,
        z.ZodLiteral<2>,
        z.ZodLiteral<3>,
        z.ZodLiteral<4>
      ]
    )
    .describe('Font size level (0-4).')
})

const SECTION_ALIASES: Record<string, OpenChatSettingsSection> = {
  appearance: 'display',
  theme: 'display',
  language: 'display',
  font: 'display',
  'font-size': 'display',
  sound: 'common',
  copy: 'common',
  'copy-cot': 'common',
  proxy: 'common',
  prompts: 'prompt',
  providers: 'provider'
}

const OPEN_SECTIONS = [
  'common',
  'display',
  'provider',
  'mcp',
  'prompt',
  'acp',
  'memory',
  'knowledge-base',
  'database',
  'shortcut',
  'about'
] as const satisfies readonly OpenChatSettingsSection[]

const OPEN_SECTION_ALIASES = [
  'appearance',
  'theme',
  'language',
  'font',
  'font-size',
  'sound',
  'copy',
  'copy-cot',
  'proxy',
  'prompts',
  'providers'
] as const

const OPEN_SECTION_VALUES = [...OPEN_SECTIONS, ...OPEN_SECTION_ALIASES] as const

const openSchema = z.strictObject({
  section: z.enum([...OPEN_SECTION_VALUES] as [string, ...string[]]).optional()
})

const SETTINGS_ROUTE_NAMES = {
  common: 'settings-common',
  display: 'settings-display',
  provider: 'settings-provider',
  mcp: 'settings-mcp',
  prompt: 'settings-prompt',
  acp: 'settings-acp',
  memory: 'settings-memory',
  'knowledge-base': 'settings-knowledge-base',
  database: 'settings-database',
  shortcut: 'settings-shortcut',
  about: 'settings-about'
} as const satisfies Record<OpenChatSettingsSection, string>

const normalizeSection = (section?: string): OpenChatSettingsSection | undefined => {
  if (!section) return undefined
  const normalized = section.trim().toLowerCase()
  if (!normalized) return undefined
  if (OPEN_SECTIONS.includes(normalized as OpenChatSettingsSection)) {
    return normalized as OpenChatSettingsSection
  }
  return SECTION_ALIASES[normalized]
}

type ApplyError = Extract<ApplyChatSettingResult, { ok: false }>

const buildError = (
  errorCode: ApplyError['errorCode'],
  message: string,
  details?: unknown
): ApplyError => ({
  ok: false,
  errorCode,
  message,
  ...(details ? { details } : {})
})

export class ChatSettingsToolHandler {
  constructor(
    private readonly options: {
      desktopSettings: AgentDisplaySettingsPort
      skillSettings: SkillSettingsPort
      skillService: SkillServicePort
      windowRuntime: AgentDesktopToolPort
    }
  ) {}

  private async ensureSkillActive(
    conversationId?: string,
    activeSkillNames?: string[]
  ): Promise<ApplyChatSettingResult | null> {
    if (!conversationId) {
      return buildError('skill_inactive', 'No conversation context to apply settings.')
    }
    if (!this.options.skillSettings.isEnabled()) {
      return buildError('skill_inactive', 'Skills are disabled.')
    }
    const activeSkills =
      activeSkillNames ?? (await this.options.skillService.getActiveSkills(conversationId))
    if (!activeSkills.some((name) => resolveLegacySkillName(name) === CHAT_SETTINGS_SKILL_NAME)) {
      return buildError('skill_inactive', 'jiaorong-settings skill is not active.')
    }
    return null
  }

  private getCurrentValue(key: string): ChatSettingValue | undefined {
    switch (key) {
      case 'copyWithCotEnabled':
        return this.options.desktopSettings.getCopyWithCotEnabled()
      case 'language':
        return this.options.desktopSettings.getRequestedLanguage() as ChatLanguage
      case 'theme':
        return this.options.desktopSettings.getTheme()
      case 'fontSizeLevel':
        return this.options.desktopSettings.getFontSizeLevel()
      default:
        return undefined
    }
  }

  async toggle(
    raw: unknown,
    conversationId?: string,
    activeSkillNames?: string[],
    beforeMutation?: (normalizedArguments: Record<string, unknown>) => void
  ): Promise<ApplyChatSettingResult> {
    const guard = await this.ensureSkillActive(conversationId, activeSkillNames)
    if (guard) {
      return guard
    }

    const parsed = toggleSchema.safeParse(raw)
    if (!parsed.success) {
      return buildError('invalid_request', 'Invalid toggle request.', z.flattenError(parsed.error))
    }

    const { setting, enabled } = parsed.data
    const previousValue = this.getCurrentValue(setting)
    beforeMutation?.(parsed.data)
    try {
      switch (setting) {
        case 'copyWithCotEnabled':
          this.options.desktopSettings.setCopyWithCotEnabled(enabled)
          break
        default:
          return buildError('unknown_setting', `Unsupported toggle: ${setting}`)
      }
    } catch (error) {
      return buildError(
        'apply_failed',
        'Failed to apply JiaorongAI toggle.',
        error instanceof Error ? error.message : String(error)
      )
    }

    return {
      ok: true,
      id: setting,
      value: enabled,
      previousValue,
      appliedAt: Date.now()
    }
  }

  async setLanguage(
    raw: unknown,
    conversationId?: string,
    activeSkillNames?: string[],
    beforeMutation?: (normalizedArguments: Record<string, unknown>) => void
  ): Promise<ApplyChatSettingResult> {
    const guard = await this.ensureSkillActive(conversationId, activeSkillNames)
    if (guard) {
      return guard
    }

    const parsed = languageSchema.safeParse(raw)
    if (!parsed.success) {
      return buildError(
        'invalid_request',
        'Invalid language request.',
        z.flattenError(parsed.error)
      )
    }

    const { language } = parsed.data
    const previousValue = this.getCurrentValue('language')
    beforeMutation?.(parsed.data)
    try {
      this.options.desktopSettings.setLanguage(language)
    } catch (error) {
      return buildError(
        'apply_failed',
        'Failed to apply JiaorongAI language.',
        error instanceof Error ? error.message : String(error)
      )
    }

    return {
      ok: true,
      id: 'language',
      value: language,
      previousValue,
      appliedAt: Date.now()
    }
  }

  async setTheme(
    raw: unknown,
    conversationId?: string,
    activeSkillNames?: string[],
    beforeMutation?: (normalizedArguments: Record<string, unknown>) => void
  ): Promise<ApplyChatSettingResult> {
    const guard = await this.ensureSkillActive(conversationId, activeSkillNames)
    if (guard) {
      return guard
    }

    const parsed = themeSchema.safeParse(raw)
    if (!parsed.success) {
      return buildError('invalid_request', 'Invalid theme request.', z.flattenError(parsed.error))
    }

    const { theme } = parsed.data
    const previousValue = this.getCurrentValue('theme')
    beforeMutation?.(parsed.data)
    try {
      this.options.desktopSettings.setTheme(theme)
    } catch (error) {
      return buildError(
        'apply_failed',
        'Failed to apply JiaorongAI theme.',
        error instanceof Error ? error.message : String(error)
      )
    }

    return {
      ok: true,
      id: 'theme',
      value: theme,
      previousValue,
      appliedAt: Date.now()
    }
  }

  async setFontSize(
    raw: unknown,
    conversationId?: string,
    activeSkillNames?: string[],
    beforeMutation?: (normalizedArguments: Record<string, unknown>) => void
  ): Promise<ApplyChatSettingResult> {
    const guard = await this.ensureSkillActive(conversationId, activeSkillNames)
    if (guard) {
      return guard
    }

    const parsed = fontSizeSchema.safeParse(raw)
    if (!parsed.success) {
      return buildError(
        'invalid_request',
        'Invalid font size request.',
        z.flattenError(parsed.error)
      )
    }

    const { level } = parsed.data
    const previousValue = this.getCurrentValue('fontSizeLevel')
    beforeMutation?.(parsed.data)
    try {
      this.options.desktopSettings.setFontSizeLevel(level)
    } catch (error) {
      return buildError(
        'apply_failed',
        'Failed to apply JiaorongAI font size.',
        error instanceof Error ? error.message : String(error)
      )
    }

    return {
      ok: true,
      id: 'fontSizeLevel',
      value: level,
      previousValue,
      appliedAt: Date.now()
    }
  }

  async open(
    raw: unknown,
    conversationId?: string,
    activeSkillNames?: string[],
    beforeMutation?: (normalizedArguments: Record<string, unknown>) => void
  ): Promise<OpenChatSettingsResult> {
    const guard = await this.ensureSkillActive(conversationId, activeSkillNames)
    if (guard && !guard.ok) {
      return {
        ok: false,
        errorCode: 'skill_inactive',
        message: guard.message,
        details: guard.details
      }
    }

    const parsed = openSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'Invalid settings navigation request.',
        details: z.flattenError(parsed.error)
      }
    }

    const { section } = parsed.data
    const normalizedSection = normalizeSection(section)
    const routeName = normalizedSection ? SETTINGS_ROUTE_NAMES[normalizedSection] : undefined

    beforeMutation?.(parsed.data)
    const windowId = await this.options.windowRuntime.createSettingsWindow()
    if (!windowId) {
      return {
        ok: false,
        errorCode: 'open_failed',
        message: 'Failed to open settings window.'
      }
    }

    if (routeName) {
      this.options.windowRuntime.sendSettingsNavigation(windowId, {
        routeName,
        section: normalizedSection
      })
    }

    return {
      ok: true,
      section: normalizedSection,
      routeName,
      appliedAt: Date.now()
    }
  }
}

export const buildChatSettingsToolDefinitions = (allowedTools: string[]): MCPToolDefinition[] => {
  const definitions: MCPToolDefinition[] = []
  const allowToggle = allowedTools.includes(CHAT_SETTINGS_TOOL_NAMES.toggle)
  const allowLanguage = allowedTools.includes(CHAT_SETTINGS_TOOL_NAMES.setLanguage)
  const allowTheme = allowedTools.includes(CHAT_SETTINGS_TOOL_NAMES.setTheme)
  const allowFontSize = allowedTools.includes(CHAT_SETTINGS_TOOL_NAMES.setFontSize)
  const allowOpen = allowedTools.includes(CHAT_SETTINGS_TOOL_NAMES.open)

  if (allowToggle) {
    definitions.push({
      execution: TOOL_EXECUTION.write,
      type: 'function',
      function: {
        name: CHAT_SETTINGS_TOOL_NAMES.toggle,
        displayName: '切换设置',
        description: '切换交融AI开关类设置。',
        parameters: toDeepChatJsonSchema(toggleSchema) as {
          type: string
          properties: Record<string, unknown>
          required?: string[]
        }
      },
      server: {
        name: 'jiaorong-settings',
        icons: 'settings',
        description: 'JiaorongAI settings control'
      }
    })
  }

  if (allowLanguage) {
    definitions.push({
      execution: TOOL_EXECUTION.write,
      type: 'function',
      function: {
        name: CHAT_SETTINGS_TOOL_NAMES.setLanguage,
        displayName: '设置语言',
        description: '设置交融AI语言/区域。',
        parameters: toDeepChatJsonSchema(languageSchema) as {
          type: string
          properties: Record<string, unknown>
          required?: string[]
        }
      },
      server: {
        name: 'jiaorong-settings',
        icons: 'settings',
        description: 'JiaorongAI settings control'
      }
    })
  }

  if (allowTheme) {
    definitions.push({
      execution: TOOL_EXECUTION.write,
      type: 'function',
      function: {
        name: CHAT_SETTINGS_TOOL_NAMES.setTheme,
        displayName: '设置主题',
        description: '设置交融AI主题模式。',
        parameters: toDeepChatJsonSchema(themeSchema) as {
          type: string
          properties: Record<string, unknown>
          required?: string[]
        }
      },
      server: {
        name: 'jiaorong-settings',
        icons: 'settings',
        description: 'JiaorongAI settings control'
      }
    })
  }

  if (allowFontSize) {
    definitions.push({
      execution: TOOL_EXECUTION.write,
      type: 'function',
      function: {
        name: CHAT_SETTINGS_TOOL_NAMES.setFontSize,
        displayName: '设置字号',
        description: '设置交融AI字号级别。',
        parameters: toDeepChatJsonSchema(fontSizeSchema) as {
          type: string
          properties: Record<string, unknown>
          required?: string[]
        }
      },
      server: {
        name: 'jiaorong-settings',
        icons: 'settings',
        description: 'JiaorongAI settings control'
      }
    })
  }

  if (allowOpen) {
    definitions.push({
      execution: TOOL_EXECUTION.write,
      type: 'function',
      function: {
        name: CHAT_SETTINGS_TOOL_NAMES.open,
        displayName: '打开设置页',
        description: '当其他设置工具无法满足请求时打开交融AI设置页；若变更已生效则不要调用。',
        parameters: toDeepChatJsonSchema(openSchema) as {
          type: string
          properties: Record<string, unknown>
          required?: string[]
        }
      },
      server: {
        name: 'jiaorong-settings',
        icons: 'settings',
        description: 'JiaorongAI settings control'
      }
    })
  }

  return definitions
}
