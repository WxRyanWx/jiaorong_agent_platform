import HmacSHA1 from 'crypto-js/hmac-sha1'
import Base64 from 'crypto-js/enc-base64'
import { SM4Encrypt, SM4Decrypt } from './sm4'
import { isEmptyObject } from './is'

export function pwdEncrypt(value: string) {
  if (value) {
    return SM4Encrypt(value)
  }
  return ''
}

export function pwdDecrypt(value: string) {
  if (value) {
    return SM4Decrypt(value)
  }
  return ''
}

export function initParams(obj: Record<string, string | number>) {
  return Object.keys(obj)
    .map((key) => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`
    })
    .join('&')
}

const Dvalue = () => {
  return `${localStorage.getItem('ts-D-value')}` === 'null'
    ? 0
    : Number(`${localStorage.getItem('ts-D-value')}`)
}

const objTransUrlParams = (obj: Record<string, unknown>) => {
  const params: string[] = []
  Object.keys(obj).forEach((key) => {
    let value = obj[key]
    if (typeof value === 'undefined') {
      value = ''
    }
    params.push([key, value].join('='))
  })
  return params.join('&')
}

const sortUrlParams = (str: string) => {
  if (typeof str !== 'string') {
    return {}
  }
  const paramObj: Record<string, string | string[]> = {}
  const paramArr = decodeURI(str).split('&')
  for (let i = 0; i < paramArr.length; i++) {
    const tmp = paramArr[i].split('=')
    const key = tmp[0]
    const value = tmp[1] || ''
    if (typeof paramObj[key] === 'undefined') {
      paramObj[key] = value
    } else {
      const newValue = (Array.isArray(paramObj[key]) ? paramObj[key] : [paramObj[key]]) as string[]
      newValue.push(value)
      paramObj[key] = newValue
    }
  }
  return paramObj
}

const objKeySort = (obj: Record<string, unknown>) => {
  const newkey = Object.keys(obj).sort()
  const newObj: Record<string, unknown> = {}
  for (let i = 0; i < newkey.length; i++) {
    newObj[newkey[i]] = obj[newkey[i]]
  }
  return newObj
}

const defaultSettings = {
  CLIENT: 'fusion',
  TENENT_ID: '100000'
}

export const getDecParams = (rest: Record<string, unknown>) => {
  let Params = ''
  const ts = Math.floor(new Date().getTime() / 1000) + Dvalue()
  const ttl = 180
  const obj = rest || {}
  Params += `tid=${defaultSettings.TENENT_ID}&ts=${ts}&ttl=${ttl}&uid=${defaultSettings.CLIENT}${
    isEmptyObject(obj) ? '' : `&${objTransUrlParams(obj)}`
  }`
  let ParamArr = sortUrlParams(Params) as Record<string, string | string[]>
  ParamArr = objKeySort(ParamArr) as Record<string, string | string[]>
  const paramstrArr: string[] = []
  Object.keys(ParamArr).forEach((i) => {
    paramstrArr.push(`${i}=${ParamArr[i]}`)
  })
  const paramstr = paramstrArr.join('&')
  const signWordArray = HmacSHA1(paramstr, 'fusion_secret')
  const sign = Base64.stringify(signWordArray)
  return {
    paramstr,
    signParams: {
      sign,
      ts,
      ttl,
      uid: defaultSettings.CLIENT,
      tid: defaultSettings.TENENT_ID,
      ...ParamArr
    }
  }
}
