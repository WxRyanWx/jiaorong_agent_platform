/**
 * 模型中心（model-center）接口：用扫码登录 token 换取内置 Jiaorong 服务商 key。
 * 复用私有 API 的 axios 实例：自动注入 Fusion-Auth、401 静默续期。
 */

import request, { isAuthApiSuccessCode } from '../auth/interceptors'
import type { ModelCenterEnvelope, ModelCenterProject } from './types'

/** 项目初始化接口；axios baseURL 已含 `/api`。 */
const PROJECT_INIT_PATH = 'model-center/project/init'
/** 创建 key 接口。 */
const API_KEY_CREATE_PATH = 'model-center/apiKey/create'
/** 创建 key 时的来源标记，与网页端保持一致。 */
const API_KEY_SOURCE = 1
/** 启动链路自己处理失败，不让拦截器再弹全局提示。 */
const SILENT_HEADERS = { dontShowMessage: true }

/**
 * POST 模型中心接口并拆信封。
 * @param path 相对 `baseURL` 的路径，含 query
 * @param body 可空 JSON 请求体
 */
async function postModelCenter<T>(path: string, body?: unknown): Promise<T> {
  /** 拦截器已把 axios 响应解包成后端信封。 */
  const envelope = (await request.post(path, body, {
    headers: SILENT_HEADERS
  })) as unknown as ModelCenterEnvelope<T>
  if (!isAuthApiSuccessCode(envelope?.code) || envelope?.success === false) {
    throw new Error(envelope?.message || `model-center ${path} failed`)
  }
  return envelope.data as T
}

/**
 * 取当前用户名下第一个项目。
 */
export async function fetchModelCenterProjectId(): Promise<number> {
  /** 项目列表。 */
  const projects = await postModelCenter<ModelCenterProject[]>(PROJECT_INIT_PATH)
  /** 首个带合法 id 的项目。 */
  const projectId = Array.isArray(projects)
    ? projects.find((item) => Number.isInteger(item?.id))?.id
    : undefined
  if (!projectId) throw new Error('model-center project/init returned no project id')
  return projectId
}

/**
 * 为项目创建一把新 key。
 * @param projectId `project/init` 返回的项目 id
 * @returns 后端下发的明文 key
 */
export async function createModelCenterApiKey(projectId: number): Promise<string> {
  /** 与网页端一致的 query。 */
  const query = new URLSearchParams({
    projectId: String(projectId),
    source: String(API_KEY_SOURCE)
  })
  /** 后端返回的 key。 */
  const data = await postModelCenter<string>(`${API_KEY_CREATE_PATH}?${query.toString()}`, {
    projectId: String(projectId),
    source: API_KEY_SOURCE
  })
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('model-center apiKey/create returned an empty key')
  }
  return data.trim()
}

/**
 * `project/init` → `apiKey/create` 的完整换 key 流程。
 */
export async function requestModelCenterApiKey(): Promise<string> {
  /** 项目 id。 */
  const projectId = await fetchModelCenterProjectId()
  return createModelCenterApiKey(projectId)
}
