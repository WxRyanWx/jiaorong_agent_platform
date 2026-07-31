import { JiaorongProcessModule } from '../runtime/types'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const screenshotModule: JiaorongProcessModule = {
  id: 'screenshot',
  label: '截图',
  trayItems: [
    {
      id: 'screenshot',
      label: '截图',
      order: 1,
      type: 'function',
      func: () => {
        console.log('screenshot Start!!!')
        console.log(process.cwd())
        const executablePath = getScreenshotExecutablePath()
        spawn('.' + executablePath, ['--clipboard'], {
          shell: false,
          windowsHide: false,
          stdio: 'inherit',
          detached: true
        })
      }
    }
  ]
}

const getScreenshotExecutablePath = (): string => {
  const root = '/src/jiaorong_src/process/screenshot/resources/screenshot-runtime/'
  if (process.platform == 'darwin') {
    return join(root, 'JiaorongScreenshot.app/Contents/MacOS/JiaorongScreenshot')
  } else if (process.platform == 'win32') {
    return join(root, 'jiaorong-screenshot-win-arm64.exe')
  }
  return root
}

export default screenshotModule
export { screenshotModule }
