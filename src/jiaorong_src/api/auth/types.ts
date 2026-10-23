export type AuthApiResponse<T = unknown> = {
  code: number
  data: T
  message?: string
  status?: boolean
}

export type LoginSuccessData = {
  id?: string
  access_token: string
  userName: string
  userFullname?: string
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
  orgList?: Array<{ name?: string; orgNo?: string; pathNo?: string }>
  [key: string]: unknown
}
