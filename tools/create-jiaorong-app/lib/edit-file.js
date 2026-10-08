/**
 * 模板改写的公共手法。
 *
 * 所有改写都声明「期望命中次数」，命中数对不上就抛错：示例应用改了写法时会立刻暴露，
 * 不会静默生成一份配置不一致的项目。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * 按锚点改写文本文件。
 * @param options projectDir 项目目录；rules 规则数组，每项 `{ file, find, to, expect }`
 * @returns 改写过的文件相对路径列表
 */
export const applyRules = ({ projectDir, rules }) => {
  /** 被改写过的文件，用来给调用方打印摘要。 */
  const touched = new Set()
  for (const rule of rules) {
    /** 目标文件绝对路径。 */
    const filePath = path.join(projectDir, rule.file)
    /** 原内容。 */
    const source = readFileSync(filePath, 'utf8')
    /** 实际命中次数。 */
    const hits = source.match(rule.find)?.length ?? 0
    if (hits !== rule.expect) {
      throw new Error(`${rule.file} 的锚点命中 ${hits} 次，期望 ${rule.expect} 次：${rule.find}`)
    }
    writeFileSync(filePath, source.replace(rule.find, rule.to))
    touched.add(rule.file)
  }
  return [...touched]
}

/**
 * 改写 JSON 文件，保留两空格缩进与末尾换行。
 * @param filePath 文件绝对路径
 * @param patch 要覆盖的字段；值为 undefined 表示删掉该字段
 */
export const patchJson = (filePath, patch) => {
  /** 原内容。 */
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete json[key]
    else json[key] = value
  }
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`)
}

/**
 * 删掉 package.json 里的若干依赖。
 * @param options filePath package.json 路径；names 依赖名数组
 */
export const removeDeps = ({ filePath, names }) => {
  /** 原内容。 */
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  for (const group of ['dependencies', 'devDependencies']) {
    if (!json[group]) continue
    for (const name of names) delete json[group][name]
  }
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`)
}
