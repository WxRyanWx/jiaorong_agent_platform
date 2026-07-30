import { describe, expect, it } from 'vitest'
import {
  formatSkillInstallError,
  formatSkillUninstallError,
  unwrapSkillInstallErrorMessage
} from '../../../../src/jiaorong_src/skills/lib/formatSkillInstallError'

describe('formatSkillInstallError', () => {
  it('unwraps electron ipc prefix', () => {
    expect(
      unwrapSkillInstallErrorMessage(
        "Error invoking remote method 'deepchat:routeInvoke': Error: ENOTEMPTY, Directory not empty"
      )
    ).toContain('ENOTEMPTY')
  })

  it('explains missing SKILL.md for folder without saying zip', () => {
    const msg = formatSkillInstallError('SKILL.md not found in zip archive', 'folder')
    expect(msg).toContain('SKILL.md')
    expect(msg).toContain('文件夹')
    expect(msg.toLowerCase()).not.toContain('zip')
  })

  it('explains missing SKILL.md for non-skill zip', () => {
    const msg = formatSkillInstallError('SKILL.md not found in zip archive', 'zip')
    expect(msg).toContain('压缩包')
    expect(msg).toContain('SKILL.md')
    expect(msg).toContain('普通附件')
  })

  it('maps Windows ENOTEMPTY cleanup noise to friendly Chinese', () => {
    const msg = formatSkillInstallError(
      "Error invoking remote method 'deepchat:routeInvoke': Error: ENOTEMPTY, Directory not empty: \\\\?\\C:\\Users\\Temp\\jiaorong-skill-qmlWXQ",
      'zip'
    )
    expect(msg).toContain('技能压缩包')
    expect(msg).not.toContain('ENOTEMPTY')
    expect(msg).not.toContain('routeInvoke')
  })

  it('maps frontmatter field errors', () => {
    expect(formatSkillInstallError('Skill name not found in SKILL.md frontmatter')).toContain(
      'name'
    )
    expect(
      formatSkillInstallError('Skill description not found in SKILL.md frontmatter')
    ).toContain('description')
  })

  it('maps invalid download url without claiming missing SKILL.md', () => {
    const msg = formatSkillInstallError('invalid url', 'remote')
    expect(msg).toContain('下载地址')
    expect(msg).not.toContain('SKILL.md')
  })

  it('maps network and download payload failures', () => {
    expect(formatSkillInstallError('fetch failed', 'remote')).toContain('网络')
    expect(formatSkillInstallError('Download timed out', 'remote')).toContain('超时')
    expect(formatSkillInstallError('Downloaded zip is empty', 'remote')).toContain('为空')
    expect(formatSkillInstallError('File too large: 99999999 bytes', 'remote')).toContain('过大')
  })

  it('uses pick-oriented fallback for system errors while selecting files', () => {
    const msg = formatSkillInstallError('EACCES: permission denied', 'pick')
    expect(msg).toContain('选择')
    expect(msg).not.toContain('SKILL.md')
  })
})

describe('formatSkillUninstallError', () => {
  it('maps protected skill deletion', () => {
    expect(formatSkillUninstallError('protected-system-skill')).toContain('不可删除')
  })

  it('maps ENOTEMPTY during uninstall without install wording', () => {
    const msg = formatSkillUninstallError('ENOTEMPTY, Directory not empty')
    expect(msg).toContain('卸载')
    expect(msg).not.toContain('压缩包')
  })

  it('uses uninstall fallback for unknown english errors', () => {
    const msg = formatSkillUninstallError('some obscure host failure')
    expect(msg).toContain('卸载失败')
    expect(msg).not.toContain('SKILL.md')
  })
})
