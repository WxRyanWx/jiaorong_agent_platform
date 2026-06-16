export type AuthApiResponse<T = unknown> = {
  code: number
  data: T
  message?: string
  status?: boolean
}

export type LoginSuccessData = {
  access_token: string
  userName: string
}

export type CaptchaCheckData = {
  phone: string
  key: string
  isInitPwd: boolean
}

export type UserInfoData = {
  id: string
  userName: string
  userFullname?: string
  orgList?: Array<{ name?: string }>
  [key: string]: unknown
}
