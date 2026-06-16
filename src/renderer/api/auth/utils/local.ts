/** 仅清除桥接登录相关 storage，避免误清应用设置等其它 localStorage */
export const clearAuthStorage = () => {
  localStorage.removeItem('xkaitoken')
  localStorage.removeItem('userFullInfo')
  localStorage.removeItem('userInfo')
}

/** @deprecated 401 等场景请用 clearAuthStorage，勿清空整个 localStorage */
export const removeAll = () => {
  localStorage.clear()
}
