const isElectronPlateform = () => {
  const isElectron = navigator.userAgent.toLowerCase().indexOf('electron/') > -1
  const urlParams = new URLSearchParams(window.location.search)
  const isInElectronApp = urlParams.get('platform') === 'electron' || isElectron
  return isInElectronApp
}

export default isElectronPlateform
