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
 *
 * 模板可能是 CRLF：Windows 上 `core.autocrlf=true`（Git for Windows 安装器默认值）检出就是这样。
 * 锚点里写的是字面 `\n`，直接拿原文匹配会一次都不中，所以统一先归一成 LF 再匹配，
 * 写回时还原成文件本来的行尾，避免生成出混合行尾的项目。
 * 纯 LF 的文件走短路分支，行为与归一化之前完全一致。
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
    const raw = readFileSync(filePath, 'utf8')
    /** 文件本来的行尾：出现过 CRLF 就整份按 CRLF 写回。 */
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    /** 参与匹配的内容：一律按 LF 比对，锚点才不用管模板是从哪个系统检出的。 */
    const source = eol === '\n' ? raw : raw.replace(/\r\n/g, '\n')
    /** 实际命中次数。 */
    const hits = source.match(rule.find)?.length ?? 0
    if (hits !== rule.expect) {
      throw new Error(`${rule.file} 的锚点命中 ${hits} 次，期望 ${rule.expect} 次：${rule.find}`)
    }
    /** 替换结果：`to` 也按 LF 写，最后统一还原行尾。 */
    const replaced = source.replace(rule.find, rule.to)
    writeFileSync(filePath, eol === '\n' ? replaced : replaced.replace(/\n/g, eol))
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
