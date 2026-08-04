/** 判断是否非标准接口 */
export const isStandardUrl = ['/sys-auth/oauth/token']

export const isTrue = () => {
  const url = new URL(window.location.href)
  const hostWithPort = url.host
  const pathArr = window.location.href.split(hostWithPort)
  const afterPathArr = pathArr[pathArr.length - 1].split('/')
  return afterPathArr[1] === 'xk'
}
