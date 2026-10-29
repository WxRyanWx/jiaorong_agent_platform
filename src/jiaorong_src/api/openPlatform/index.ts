/** 开放平台 API 入口：默认走真实接口，单测可用 `setOpenPlatformClient` 注入替身。 */

import { createHttpOpenPlatformClient } from './httpApi'
import type { OpenPlatformClient } from './types'

let currentClient: OpenPlatformClient = createHttpOpenPlatformClient()

export function getOpenPlatformClient(): OpenPlatformClient {
  return currentClient
}

export function setOpenPlatformClient(client: OpenPlatformClient): void {
  currentClient = client
}
