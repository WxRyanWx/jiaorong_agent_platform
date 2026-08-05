import type { JiaorongModule } from './types'
import authModule from '../auth/module'
import knowledgeBaseModule from '../knowledgeBase/module'
import skillsModule from '../skills/module'

/** 内置私有模块清单（sidebar / mount 共用，避免两处漂移） */
export const BUILTIN_MODULES: JiaorongModule[] = [authModule, skillsModule, knowledgeBaseModule]
