import { reactive } from 'vue'

export interface SkillDetailMock {
  id: string
  name: string
  description: string
  source: 'market' | 'local'
  installed: boolean
  enabled: boolean
  tryPrompts: string[]
}

interface SkillMockSeed {
  id: string
  name: string
  description: string
  source?: SkillDetailMock['source']
}

// 与 ~/.jiaorongchat/skills 中当前已发现的技能名保持一致，确保真实文件操作可以命中。
const skillSeeds: SkillMockSeed[] = [
  {
    id: 'algorithmic-art',
    name: '算法艺术',
    description: '使用带种子随机性和交互参数的 p5.js 创建原创算法艺术。'
  },
  {
    id: 'bid-tender-master',
    name: '标书大师',
    description: '根据项目名称和预算生成投标文件，并检查报价一致性和废标风险。'
  },
  {
    id: 'bigplan',
    name: 'BigPlan 产品调研',
    description: '分析市场、技术和供应链，输出高、中、低三套产品规格方案。'
  },
  {
    id: 'code-review',
    name: '代码审查',
    description: '分析代码质量、安全性和最佳实践。',
    source: 'local'
  },
  {
    id: 'construction-plan-reviewer',
    name: '施工方案审核',
    description: '执行施工方案严重缺陷筛查、四维深度审核和专业工程审核。'
  },
  {
    id: 'doc-coauthoring',
    name: '文档合著',
    description: '通过上下文收集、结构细化和读者验证完成结构化文档协作。'
  },
  {
    id: 'docx',
    name: 'Word 文档',
    description: '创建、编辑和分析 Word 文档，支持修订、注释和格式保留。'
  },
  {
    id: 'frontend-design',
    name: '前端设计',
    description: '创建具有高设计质量的生产级前端界面和 Web 组件。'
  },
  {
    id: 'git-commit',
    name: 'Git 提交',
    description: '按照常规提交标准生成格式良好的 Git 提交信息。',
    source: 'local'
  },
  {
    id: 'infographic-syntax-creator',
    name: '信息图表语法',
    description: '将用户内容转换为 AntV 信息图模板、数据结构和主题语法。'
  },
  {
    id: 'deepchat-settings',
    name: '交融AI设置',
    description: '修改交融AI的主题、语言、字体大小等应用设置。'
  },
  {
    id: 'mcp-builder',
    name: 'MCP 构建',
    description: '创建高质量 MCP 服务器，使模型能够调用外部 API 和服务。'
  },
  {
    id: 'pdf',
    name: 'PDF 工具',
    description: '提取、创建、合并、拆分 PDF 文档并处理表单。'
  },
  {
    id: 'pptx',
    name: '演示文稿',
    description: '创建、编辑和分析演示文稿，支持布局、评论和演讲者笔记。'
  },
  {
    id: 'prd-generator',
    name: 'PRD 生成器',
    description: '使用标准模板生成结构完整的产品需求文档。'
  },
  {
    id: 'session-duration',
    name: '会话时长',
    description: '计算并展示当前会话持续时间。',
    source: 'local'
  },
  {
    id: 'skill-creator',
    name: '技能创建',
    description: '通过专业知识、工作流程或工具集成创建和更新技能。'
  },
  {
    id: 'summarize',
    name: '内容总结',
    description: '对文本、技术文档、会议记录和代码等内容进行智能总结。'
  },
  {
    id: 'web-artifacts-builder',
    name: 'Web 应用构建',
    description: '使用 React、Tailwind CSS 和 shadcn/ui 创建复杂 Web 应用。'
  },
  {
    id: 'xlsx',
    name: '电子表格',
    description: '创建、编辑和分析电子表格，支持公式、格式和数据可视化。'
  }
]

function createTryPrompts(skillName: string): string[] {
  return [
    `请介绍“${skillName}”适合解决哪些问题。`,
    `请使用“${skillName}”帮我完成一个典型任务。`,
    `请给出“${skillName}”的推荐使用流程和注意事项。`
  ]
}

const mockSkills = reactive<SkillDetailMock[]>(
  skillSeeds.map((seed) => {
    const source = seed.source ?? 'market'
    return {
      ...seed,
      source,
      installed: true,
      enabled: true,
      tryPrompts: source === 'market' ? createTryPrompts(seed.name) : []
    }
  })
)

export function getMockSkills(): SkillDetailMock[] {
  return mockSkills
}

export function getMockSkill(skillId: string): SkillDetailMock | undefined {
  return mockSkills.find((skill) => skill.id === skillId)
}

export function installMockSkill(skillId: string): void {
  const skill = getMockSkill(skillId)
  if (skill) {
    skill.installed = true
    skill.enabled = true
  }
}

export function applyMockSkillUninstalled(skillId: string): SkillDetailMock['source'] | undefined {
  const skill = getMockSkill(skillId)
  if (!skill) {
    return undefined
  }

  if (skill.source === 'local') {
    const index = mockSkills.findIndex((item) => item.id === skillId)
    if (index >= 0) {
      mockSkills.splice(index, 1)
    }
  } else {
    skill.installed = false
  }

  return skill.source
}

export function setMockSkillEnabled(skillId: string, enabled: boolean): void {
  const skill = getMockSkill(skillId)
  if (skill?.installed) {
    skill.enabled = enabled
  }
}
