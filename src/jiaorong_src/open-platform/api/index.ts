/** 开放平台 API 入口：一期使用 mock，后端接入后替换 client。 */

import { createMockOpenPlatformClient } from './mockOpenPlatformApi'
import type { OpenPlatformClient } from '../types'

let currentClient: OpenPlatformClient = createMockOpenPlatformClient()

export function getOpenPlatformClient(): OpenPlatformClient {
  return currentClient
}

export function setOpenPlatformClient(client: OpenPlatformClient): void {
  currentClient = client
}
