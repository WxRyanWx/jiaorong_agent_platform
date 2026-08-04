const getSearchParams = (): URLSearchParams => {
  const fromLocation = new URLSearchParams(window.location.search)
  if ([...fromLocation.keys()].length > 0) {
    return fromLocation
  }

  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  if (queryIndex >= 0) {
    return new URLSearchParams(hash.slice(queryIndex + 1))
  }

  return fromLocation
}

const getUrlQueryParam = (key: string): string | false => {
  const value = getSearchParams().get(key)
  return value || false
}

/** 从 URL query 读取免登 token（支持 token / accessToken） */
export const getUrlToken = (): string | false => {
  return getUrlQueryParam('token') || getUrlQueryParam('accessToken')
}

/** 同步将 URL 中的 token 写入 localStorage，需在路由守卫之前调用 */
export const saveTokenFromUrl = (): string | false => {
  const token = getUrlToken()
  if (token) {
    localStorage.setItem('xkaitoken', token)
  }
  return token
}
