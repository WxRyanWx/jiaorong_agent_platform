/**
 * 默认预装市场技能清单（安装/升级/同版本覆盖安装后补装一次）。
 * 项为市场当前 name，与远程 list 的 name 精确匹配（大小写不敏感）。
 */

export { DEFAULT_SKILLS_SEED_BUILD_ID } from './defaultSkillsSeedBuildId.generated'

/** 产品指定的 19 个默认技能（市场 name） */
export const DEFAULT_MARKET_SKILLS: readonly string[] = [
  '施工方案审核专家',
  '24清单-建设工程工程量清单计价标准',
  '文章去AI味工具',
  '施工方案通用审查',
  '施工作业安全督察',
  '严格代码审查',
  '超级前端设计',
  'BigPlan · 产品调研（市场分析·技术评估·项目研发·产品方案）',
  '产品经理综合技能（PM Master）',
  '解决方案专家',
  '软件测试用例设计',
  '标书大师｜全行业AI标书生成助手',
  '企业背景调查/商业信息查询PLUS版',
  '招投标合规检查',
  '合同法务助手',
  'ProcessOn思维导图',
  'AI办公提效全能助手',
  '公文写作skill',
  '差旅助手'
]
