import { defineComponent, h } from 'vue'
import { Icon } from '@iconify/vue'
import { toast } from 'vue-sonner'

const SuccessIcon = defineComponent({
  name: 'JiaorongGlobalToastSuccessIcon',
  setup: () => () =>
    h(Icon, {
      icon: 'lucide:circle-check',
      class: 'h-5 w-5 fill-muted-foreground text-background'
    })
})

export interface GlobalSuccessToastOptions {
  duration?: number
}

/**
 * 显示不受业务页面生命周期影响的全局成功提示。
 *
 * 提示复用应用根节点的 Sonner 容器，因此路由跳转不会使其提前消失。
 */
export function showGlobalSuccessToast(
  message: string,
  { duration = 2000 }: GlobalSuccessToastOptions = {}
): void {
  toast(message, {
    duration,
    icon: SuccessIcon,
    position: 'top-center'
  })
}
