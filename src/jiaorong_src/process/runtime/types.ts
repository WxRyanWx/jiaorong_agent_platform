export type JiaorongTrayItem = {
  id: string
  label: string
  titleKey?: string
  title?: string
  order?: number
  type: 'route' | 'function'
  routeName?: string
  func?: () => void
}

export type JiaorongProcessModule = {
  id: string
  label: string
  trayItems?: JiaorongTrayItem[]
}
