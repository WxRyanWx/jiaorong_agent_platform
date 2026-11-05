/** User-visible product name. Must match Electron `app.setName`. */
export const CLI_PRODUCT_NAME = 'JiaorongAI'
/** User-visible command. The bundled module remains `deepchat.mjs`. */
export const CLI_COMMAND_NAME = 'jiaorong'
/** Default text-model target when the user omits --provider / --model. */
export const CLI_DEFAULT_PROVIDER_ID = 'new-jiaorong'
export const CLI_DEFAULT_MODEL_ID = 'jrdz-dsv4.1f'

export function cliUserAgent(version: string): string {
  return `${CLI_PRODUCT_NAME}-CLI/${version}`
}
