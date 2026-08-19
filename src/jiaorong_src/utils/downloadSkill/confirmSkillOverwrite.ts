import { createApp, nextTick } from 'vue'
import SkillOverwriteConfirmDialog from './SkillOverwriteConfirmDialog.vue'

/**
 * 弹出与开源仓 SkillInstallDialog 同风格的同名覆盖确认框。
 * @returns true=覆盖，false=取消
 */
export function confirmSkillOverwrite(skillName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) return
      settled = true
      app.unmount()
      container.remove()
      resolve(confirmed)
    }

    const app = createApp(SkillOverwriteConfirmDialog, {
      skillName: skillName.trim() || '同名技能',
      onResolved: finish
    })
    app.mount(container)
    void nextTick()
  })
}
