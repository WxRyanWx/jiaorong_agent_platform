import { computed, type CSSProperties } from 'vue'
import { useWindowSize } from '@vueuse/core'

/** 登录卡片设计稿尺寸 */
export const LOGIN_CARD_WIDTH = 611
export const LOGIN_CARD_HEIGHT = 708

/**
 * 参照正确截图的边距比例（相对视口）
 * - 左侧约 11.8%，保留背景左侧区域
 * - 右侧约 6%，与右侧 AI 装饰留白
 * - 上下各约 12%
 */
export const LOGIN_MARGIN_LEFT_RATIO = 0.11
export const LOGIN_MARGIN_RIGHT_RATIO = 0.06
export const LOGIN_MARGIN_Y_RATIO = 0.1

/** 绝对最小边距，避免极小窗口贴边 */
export const LOGIN_MARGIN_MIN_X = 20
export const LOGIN_MARGIN_MIN_Y = 16

/** 最小缩放比 */
export const LOGIN_PAGE_MIN_SCALE = 0.7

const clampMargin = (ratioValue: number, minValue: number) => Math.max(ratioValue, minValue)

export function useLoginPageScale() {
  const { width, height } = useWindowSize()

  const margins = computed(() => {
    const w = width.value
    const h = height.value

    return {
      left: clampMargin(w * LOGIN_MARGIN_LEFT_RATIO, LOGIN_MARGIN_MIN_X),
      right: clampMargin(w * LOGIN_MARGIN_RIGHT_RATIO, LOGIN_MARGIN_MIN_X),
      top: clampMargin(h * LOGIN_MARGIN_Y_RATIO, LOGIN_MARGIN_MIN_Y),
      bottom: clampMargin(h * LOGIN_MARGIN_Y_RATIO, LOGIN_MARGIN_MIN_Y)
    }
  })

  const scale = computed(() => {
    if (width.value <= 0 || height.value <= 0) {
      return 1
    }

    const { left, right, top, bottom } = margins.value
    const availableWidth = Math.max(width.value - left - right, 0)
    const availableHeight = Math.max(height.value - top - bottom, 0)

    const raw = Math.min(availableWidth / LOGIN_CARD_WIDTH, availableHeight / LOGIN_CARD_HEIGHT, 1)
    return Math.max(raw, LOGIN_PAGE_MIN_SCALE)
  })

  const loginScaleStyle = computed<CSSProperties>(() => ({
    zoom: scale.value
  }))

  const loginPageStyle = computed<CSSProperties>(() => {
    const { left, right, top, bottom } = margins.value
    return {
      paddingLeft: `${left}px`,
      paddingRight: `${right}px`,
      paddingTop: `${top}px`,
      paddingBottom: `${bottom}px`
    }
  })

  const isCompactLayout = computed(() => width.value <= 850)

  const loginPageClass = computed(() => ({
    'login-page': true,
    'login-page--compact': isCompactLayout.value
  }))

  return { scale, loginScaleStyle, loginPageStyle, loginPageClass }
}
