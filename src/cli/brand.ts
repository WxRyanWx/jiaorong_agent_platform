/** User-visible product name. Must match Electron `app.setName`. */
export const CLI_PRODUCT_NAME = 'JiaorongAI'
/** User-visible command. The bundled module remains `deepchat.mjs`. */
export const CLI_COMMAND_NAME = 'jiaorong'

export function cliUserAgent(version: string): string {
  return `${CLI_PRODUCT_NAME}-CLI/${version}`
}
