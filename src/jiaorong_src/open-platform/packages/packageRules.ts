/**
 * 开放平台技能 / 连接器包的共享校验规则。
 *
 * 创建草稿阶段的客户端预检与发布阶段的后端复验必须口径一致，否则用户会先"创建成功"
 * 再在"确认发布"时才被打回，且报错往往指向错误的原因（例如把反斜杠路径误报成
 * "根目录必须包含 SKILL.md"）。这里把路径与命名的判定收敛成纯函数，供两个解析器共用。
 */

import { SKILL_NAME_MAX_LENGTH } from '@shared/types/skill'

/**
 * 技术 name 规则，与 `src/main/skill/index.ts` 的 `SKILL_NAME_PATTERN` 保持单一真源。
 * 只允许小写字母、数字、点、下划线和连字符，且必须以字母或数字开头。
 */
const PACKAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/**
 * 技能 name 的长度上限。
 *
 * 复用客户端宿主侧的唯一真源 `SKILL_NAME_MAX_LENGTH`（255），不再自建常量：
 * 技能的技术 name 会作为资产 id 与本地技能目录名，能力边界应与本地技能的创建、
 * 扫描、路由校验保持一致。
 * 注意两点：`validateDraftSkillDocument` 另有 64 的上限，那是 skill-creator 草稿写入
 * 的工具链限制，不是资产 id 的契约；连接器服务名不受此限（契约允许中文）。
 */
const PACKAGE_NAME_MAX_LENGTH = SKILL_NAME_MAX_LENGTH

/**
 * 条目名里不允许出现的控制字符（含 NUL），命中即视为恶意或损坏包。
 * 用字符码判断而非字面量正则，避免 lint 的 no-control-regex 告警。
 */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    if (char.codePointAt(0)! <= 0x1f) return true
  }
  return false
}

/** 反斜杠字符：不能用字面量，避免与转义序列混淆。 */
export const PACKAGE_PATH_BACKSLASH = String.fromCharCode(92)

/**
 * 统一条目路径写法：反斜杠转正斜杠、剥掉 UTF-8 BOM、去掉开头的 "./"、去掉尾部斜杠。
 *
 * 去掉开头的 "./" 是为了兼容 `zip -r pkg.zip .` 这类常见打包方式：它会把条目存成
 * `./SKILL.md`。这在语义上就是根目录，不该报"必须位于根目录，当前在 ./SKILL.md"。
 * 只剥前导 "./"，不碰中间的段，避免掩盖 `a/../b` 这类真正的穿越。
 * 仅用于识别，不回写用户包内容。
 * @param name zip 内原始条目名
 */
export function normalizeEntryName(name: string): string {
  let normalized = name
    .split(PACKAGE_PATH_BACKSLASH)
    .join('/')
    .replace(/\ufeff/g, '')
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  return normalized.replace(/\/+$/, '')
}

/**
 * 校验单条路径是否安全可落盘，不安全时抛出带条目名的错误。
 *
 * 反斜杠与路径穿越是线上真实踩过的两类问题：前者会让客户端把它当成"根目录没有
 * SKILL.md"，后者是 zip-slip。单独区分反斜杠，是为了给出"重新打包"这种可操作的建议。
 * @param rawName zip 内原始条目名
 * @param messages 调用方提供的 i18n 文案构造器
 */
export function assertSafeEntryPath(
  rawName: string,
  messages: { backslash: (name: string) => string; unsafe: (name: string) => string }
): void {
  if (rawName.includes(PACKAGE_PATH_BACKSLASH)) {
    throw new Error(messages.backslash(rawName))
  }
  const name = normalizeEntryName(rawName)
  if (!name) return
  if (hasControlChar(name)) throw new Error(messages.unsafe(rawName))
  // 绝对路径：POSIX /… 与 Windows 盘符 C:…
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(messages.unsafe(rawName))
  }
  if (name.split('/').includes('..')) throw new Error(messages.unsafe(rawName))
}

/** 报错文案里回显的值最多保留的字符数，避免超长 name 把提示撑爆。 */
const NAME_ECHO_MAX_LENGTH = 64

/**
 * 校验技能技术 name 是否符合命名规则。
 *
 * 只用于技能：连接器服务名按契约允许中文，不能套用这条规则。
 * 超长 name 只回显前若干字符：上限已放宽到 255，整串塞进 toast 会淹没真正的修复建议。
 * @param value 待校验值
 * @param messages 调用方提供的 i18n 文案构造器
 */
export function assertValidPackageName(
  value: string,
  messages: { invalid: (name: string) => string }
): void {
  if (!PACKAGE_NAME_PATTERN.test(value) || value.length > PACKAGE_NAME_MAX_LENGTH) {
    const echo =
      value.length > NAME_ECHO_MAX_LENGTH ? `${value.slice(0, NAME_ECHO_MAX_LENGTH)}…` : value
    throw new Error(messages.invalid(echo))
  }
}
