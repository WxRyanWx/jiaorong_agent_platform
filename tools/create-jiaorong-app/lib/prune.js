/**
 * 按开关裁剪模板：不带官方 UI 组件、不带路由、不带技能示例。
 *
 * 执行顺序固定为「裁剪 → 写配置」（见 `lib/scaffold.js`），
 * 所以变体文件里保留了模板的原始锚点值，例如提示词里的「你是示例应用助手」。
 */
import { cpSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyRules, removeDeps } from './edit-file.js'

/** 本包目录。 */
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 变体文件根目录：每个开关一个子目录。 */
const variantsDir = path.join(packageDir, 'variants')

/**
 * 用变体文件覆盖项目里的文件。
 * @param options projectDir 项目目录；variant 变体子目录；from 变体文件名；to 项目内相对路径
 */
const copyVariant = ({ projectDir, variant, from, to }) => {
  cpSync(path.join(variantsDir, variant, from), path.join(projectDir, to))
}

/**
 * 删掉项目里的文件或目录。
 * @param options projectDir 项目目录；target 相对路径
 */
const remove = ({ projectDir, target }) => {
  // maxRetries：递归删目录最容易撞 Windows 杀软 / 索引服务占句柄导致的 EBUSY / ENOTEMPTY / EPERM。
  // 只有 rmSync 支持这个选项（cpSync 没有，写了会被静默忽略），且必须配 recursive: true 才生效。
  rmSync(path.join(projectDir, target), { recursive: true, force: true, maxRetries: 3 })
}

/**
 * 不带官方 UI 组件：删组件源码，换极简对话页与精简 API。
 * @param options projectDir 项目目录
 */
const pruneUi = ({ projectDir }) => {
  // 组件源码整体不要了，页面改用自己渲染的极简对话页
  remove({ projectDir, target: 'web/src/components' })
  copyVariant({
    projectDir,
    variant: 'no-ui',
    from: 'ChatPage.vue',
    to: 'web/src/pages/ChatPage.vue'
  })
  copyVariant({ projectDir, variant: 'no-ui', from: 'api-index.ts', to: 'web/src/api/index.ts' })
  copyVariant({
    projectDir,
    variant: 'no-ui',
    from: 'errorText.ts',
    to: 'web/src/lib/errorText.ts'
  })
  copyVariant({ projectDir, variant: 'no-ui', from: 'style.css', to: 'web/src/style.css' })
  // 图标、原子样式与 less 只服务组件，一起摘掉
  removeDeps({
    filePath: path.join(projectDir, 'web/package.json'),
    names: ['@iconify/vue', 'tailwindcss', '@tailwindcss/vite', 'less']
  })
  applyRules({
    projectDir,
    rules: [
      {
        file: 'web/vite.config.ts',
        find: /import tailwindcss from '@tailwindcss\/vite'\n/,
        to: '',
        expect: 1
      },
      {
        file: 'web/vite.config.ts',
        find: /plugins: \[vue\(\), tailwindcss\(\)\]/,
        to: 'plugins: [vue()]',
        expect: 1
      },
      // 占位文案是给组件输入框用的，极简页自己写了 placeholder
      {
        file: 'web/src/constants.ts',
        find: /\n\/\*\* 传给 JiaorongAgentChat 的输入框占位文案[\s\S]*?export const CHAT_PLACEHOLDER = '[^']*'\n/,
        to: '\n',
        expect: 1
      }
    ]
  })
}

/**
 * 不带路由：App.vue 直接挂对话页。
 * @param options projectDir 项目目录
 */
const pruneRouter = ({ projectDir }) => {
  remove({ projectDir, target: 'web/src/router' })
  copyVariant({ projectDir, variant: 'no-router', from: 'App.vue', to: 'web/src/App.vue' })
  copyVariant({ projectDir, variant: 'no-router', from: 'main.ts', to: 'web/src/main.ts' })
  removeDeps({ filePath: path.join(projectDir, 'web/package.json'), names: ['vue-router'] })
}

/**
 * 不带技能模板：删 skill/，提示词换成不含技能路径的版本，文档与注释里的技能表述一起清掉。
 * 必须在 `pruneUi` 之前调用：这时 `ChatPage.vue` 与 `constants.ts` 还是模板原版，锚点才命中。
 * @param options projectDir 项目目录
 */
const pruneSkill = ({ projectDir }) => {
  remove({ projectDir, target: 'skill' })
  copyVariant({ projectDir, variant: 'no-skill', from: 'agent.js', to: 'node/service/agent.js' })
  applyRules({
    projectDir,
    rules: [
      // 技能常量没人用了
      {
        file: 'node/config.js',
        find: /\n\/\*\* 应用自带的技能目录名[\s\S]*?export const DEFAULT_SKILL = '[^']*'\n/,
        to: '\n',
        expect: 1
      },
      // 提示词不再需要应用目录，forward 也就不用先问一次 getContext
      {
        file: 'node/service/forward.js',
        find: /    \/\/ 创建智能体时补技能与提示词[\s\S]*?\n    \}\n/,
        to: "    // 创建智能体时补系统提示词\n    if (method === 'agent.create') return callHost(method, withAgentDefaults(input))\n",
        expect: 1
      },
      {
        file: 'node/main.js',
        find: / - `service\/agent\.js`：技能路径与系统提示词/,
        to: ' - `service/agent.js`：系统提示词',
        expect: 1
      },
      {
        file: 'node/README.md',
        find: /agent\.js          # 技能路径与系统提示词，补齐 agent\.create 入参/,
        to: 'agent.js          # 系统提示词，补齐 agent.create 入参',
        expect: 1
      },
      {
        file: 'node/README.md',
        find: /config\.js           # 端口、智能体与技能常量/,
        to: 'config.js           # 端口与智能体常量',
        expect: 1
      },
      {
        file: 'node/README.md',
        find: /`agent\.create` 会补上 `skill\/` 下的技能与系统提示词。/,
        to: '`agent.create` 会补上系统提示词。',
        expect: 1
      },
      { file: 'README.md', find: /\n  skill\/ +# 应用自带技能[^\n]*/, to: '', expect: 1 },
      // 页面侧：文件头指引、输入框占位文案与对话页注释都不再提技能
      {
        file: 'web/src/constants.ts',
        find: /技能与系统提示词在 node\/service\/agent\.js 与 skill\/ 里。/,
        to: '系统提示词在 node/service/agent.js 里。',
        expect: 1
      },
      {
        file: 'web/src/constants.ts',
        find: /export const CHAT_PLACEHOLDER = '[^']*'/,
        to: "export const CHAT_PLACEHOLDER = '请输入你的问题…'",
        expect: 1
      },
      {
        file: 'web/src/pages/ChatPage.vue',
        find: /\/\*\* 应用内智能体，技能与系统提示词由 Node 补齐。 \*\//,
        to: '/** 应用内智能体，系统提示词由 Node 补齐。 */',
        expect: 1
      }
    ]
  })
}

/**
 * 去掉 `/` 菜单常量：极简页没有菜单，不带技能时也没有条目。
 * @param options projectDir 项目目录；withUi 是否带官方组件
 */
const pruneSlashItems = ({ projectDir, withUi }) => {
  /** 规则：常量本身一定要删，对话页的引用只在带组件时存在。 */
  const rules = [
    {
      file: 'web/src/constants.ts',
      find: /\n\/\*\* 传给 JiaorongAgentChat 的 `\/` 列表[\s\S]*?\n\]\n/,
      to: '\n',
      expect: 1
    }
  ]
  if (withUi) {
    rules.push(
      { file: 'web/src/pages/ChatPage.vue', find: /  CHAT_SLASH_ITEMS,\n/, to: '', expect: 1 },
      {
        file: 'web/src/pages/ChatPage.vue',
        find: /        :slash-items="CHAT_SLASH_ITEMS"\n/,
        to: '',
        expect: 1
      }
    )
  }
  applyRules({ projectDir, rules })
}

/**
 * 按开关裁剪项目目录。
 * @param options projectDir 项目目录；config 问答结果
 * @returns 做了哪些裁剪，用来打印摘要
 */
export const applyVariants = ({ projectDir, config }) => {
  /** 裁剪说明。 */
  const notes = []
  // 技能先剥：后面的 UI 裁剪会整份覆盖 ChatPage.vue，锚点就没了
  if (!config.withSkill) {
    pruneSkill({ projectDir })
    notes.push('去掉技能模板，提示词不再引用 SKILL.md')
  }
  if (!config.withUi) {
    pruneUi({ projectDir })
    notes.push('去掉官方 UI 组件，对话页换成极简版')
  }
  if (!config.withRouter) {
    pruneRouter({ projectDir })
    notes.push('去掉路由，App.vue 直接挂对话页')
  }
  // 极简页没有 `/` 菜单，不带技能时也没有条目，两种情况都不再需要这个常量
  if (!config.withUi || !config.withSkill) {
    pruneSlashItems({ projectDir, withUi: config.withUi })
    notes.push('去掉 `/` 菜单常量 CHAT_SLASH_ITEMS')
  }
  return { notes }
}
