import type { Prompt, SystemPrompt } from '@shared/types/prompt'
import type { SettingsStore } from '@/config/settingsStore'
import { DEFAULT_SYSTEM_PROMPT } from '@jiaorong/prompts/defaultSystemPrompt'

export { DEFAULT_SYSTEM_PROMPT }

export interface PromptSettingsEvents {
  publishCustomPromptsChanged(prompts: Prompt[]): void
  publishSystemPromptsChanged(state: {
    prompts: SystemPrompt[]
    defaultPromptId: string
    prompt: string
  }): void
}

export class PromptSettings {
  private customPromptsCache: Prompt[] | null = null

  constructor(
    private readonly settings: SettingsStore,
    private readonly events: PromptSettingsEvents
  ) {}

  async getCustomPrompts(): Promise<Prompt[]> {
    if (this.customPromptsCache !== null) {
      return this.customPromptsCache
    }

    const prompts = this.settings.get<Prompt[]>('customPrompts') || []
    this.customPromptsCache = prompts
    return prompts
  }

  async setCustomPrompts(prompts: Prompt[]): Promise<void> {
    this.settings.set('customPrompts', prompts)
    this.customPromptsCache = null
    this.events.publishCustomPromptsChanged(await this.getCustomPrompts())
  }

  async addCustomPrompt(prompt: Prompt): Promise<void> {
    await this.setCustomPrompts([...(await this.getCustomPrompts()), prompt])
  }

  async updateCustomPrompt(promptId: string, updates: Partial<Prompt>): Promise<void> {
    const prompts = await this.getCustomPrompts()
    const index = prompts.findIndex((prompt) => prompt.id === promptId)
    if (index === -1) {
      return
    }
    const updatedPrompts = [...prompts]
    updatedPrompts[index] = { ...updatedPrompts[index], ...updates }
    await this.setCustomPrompts(updatedPrompts)
  }

  async deleteCustomPrompt(promptId: string): Promise<void> {
    const prompts = await this.getCustomPrompts()
    const filteredPrompts = prompts.filter((prompt) => prompt.id !== promptId)
    if (filteredPrompts.length === prompts.length) {
      return
    }
    await this.setCustomPrompts(filteredPrompts)
  }

  async getDefaultSystemPrompt(): Promise<string> {
    const prompts = await this.getSystemPrompts()
    const defaultPrompt = prompts.find((p) => p.isDefault)
    if (defaultPrompt) {
      return defaultPrompt.content
    }
    return this.settings.get<string>('default_system_prompt') || ''
  }

  async setDefaultSystemPrompt(prompt: string): Promise<void> {
    this.settings.set('default_system_prompt', prompt)
    await this.publishSystemPromptState()
  }

  async resetToDefaultPrompt(): Promise<void> {
    const prompts = await this.getSystemPrompts()
    const defaultPromptIndex = prompts.findIndex((prompt) => prompt.id === 'default')
    if (defaultPromptIndex !== -1) {
      prompts[defaultPromptIndex] = {
        ...prompts[defaultPromptIndex],
        content: DEFAULT_SYSTEM_PROMPT,
        updatedAt: Date.now()
      }
      this.settings.set('systemPrompts', prompts)
    }
    this.settings.set('default_system_prompt', DEFAULT_SYSTEM_PROMPT)
    await this.publishSystemPromptState()
  }

  async clearSystemPrompt(): Promise<void> {
    this.settings.set('default_system_prompt', '')
    await this.publishSystemPromptState()
  }

  async getSystemPrompts(): Promise<SystemPrompt[]> {
    return this.settings.get<SystemPrompt[]>('systemPrompts') || []
  }

  async setSystemPrompts(prompts: SystemPrompt[]): Promise<void> {
    this.settings.set('systemPrompts', prompts)
    await this.publishSystemPromptState()
  }

  async addSystemPrompt(prompt: SystemPrompt): Promise<void> {
    const prompts = await this.getSystemPrompts()
    prompts.push(prompt)
    await this.setSystemPrompts(prompts)
  }

  async updateSystemPrompt(promptId: string, updates: Partial<SystemPrompt>): Promise<void> {
    const prompts = await this.getSystemPrompts()
    const index = prompts.findIndex((p) => p.id === promptId)
    if (index !== -1) {
      prompts[index] = { ...prompts[index], ...updates }
      await this.setSystemPrompts(prompts)
    }
  }

  async deleteSystemPrompt(promptId: string): Promise<void> {
    const prompts = await this.getSystemPrompts()
    const filteredPrompts = prompts.filter((p) => p.id !== promptId)
    await this.setSystemPrompts(filteredPrompts)
  }

  async setDefaultSystemPromptId(promptId: string): Promise<void> {
    const prompts = await this.getSystemPrompts()
    const updatedPrompts = prompts.map((p) => ({ ...p, isDefault: false }))

    if (promptId === 'empty') {
      await this.setSystemPrompts(updatedPrompts)
      await this.clearSystemPrompt()
      await this.publishSystemPromptState()
      return
    }

    const targetIndex = updatedPrompts.findIndex((p) => p.id === promptId)
    if (targetIndex !== -1) {
      updatedPrompts[targetIndex].isDefault = true
      await this.setSystemPrompts(updatedPrompts)
      await this.setDefaultSystemPrompt(updatedPrompts[targetIndex].content)
      await this.publishSystemPromptState()
    } else {
      await this.setSystemPrompts(updatedPrompts)
    }
  }

  async getDefaultSystemPromptId(): Promise<string> {
    const prompts = await this.getSystemPrompts()
    const defaultPrompt = prompts.find((p) => p.isDefault)
    if (defaultPrompt) {
      return defaultPrompt.id
    }

    const storedPrompt = this.settings.get<string>('default_system_prompt')
    if (!storedPrompt || storedPrompt.trim() === '') {
      return 'empty'
    }

    return prompts.find((p) => p.id === 'default')?.id || 'default'
  }

  private async publishSystemPromptState(): Promise<void> {
    this.events.publishSystemPromptsChanged({
      prompts: await this.getSystemPrompts(),
      defaultPromptId: await this.getDefaultSystemPromptId(),
      prompt: await this.getDefaultSystemPrompt()
    })
  }
}
