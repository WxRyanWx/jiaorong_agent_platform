export const getToken = () => {
  return localStorage.getItem('xkaitoken')
}

export const getUserInfo = () => {
  return (
    (localStorage.getItem('userFullInfo') && JSON.parse(localStorage.getItem('userFullInfo')!)) || {
      orgList: [{}]
    }
  )
}

export const clearOutLocal = () => {
  localStorage.removeItem('xkaitoken')
}

export function removeAll() {
  localStorage.clear()
}
