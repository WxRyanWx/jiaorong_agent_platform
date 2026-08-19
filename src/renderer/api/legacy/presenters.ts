/**
 * DeepChat 已移除 presenter:call。此文件仅为交融私有包提供编译期/运行时占位，
 * 技能安装等调用会在 P2 改接到 SkillClient / ConfigClient / DeviceClient。
 */
export function useLegacyPresenter(
  _name: string,
  _options?: { safeCall?: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return new Proxy(
    {},
    {
      get(_target, functionName) {
        return async (..._args: unknown[]) => {
          console.warn(
            `[jiaorong] legacy presenter ${_name}.${String(functionName)} is not wired on this tree`
          )
          return null
        }
      }
    }
  )
}
