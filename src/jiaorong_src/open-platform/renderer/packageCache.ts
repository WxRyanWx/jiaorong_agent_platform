/**
 * 开放平台创建技能 / 连接器时选过的 zip 缓存。
 * 开放平台用的是 tab 级 `v-if`，切走会卸载面板，组件内的 File 引用会丢；
 * 后端发布接口（`/assets/publish`）必须带 zip，草稿接口不接收文件，
 * 所以创建时选的包按 `<type>:<id>` 落到 IndexedDB，发布时自动带回，
 * 应用重启、切菜单都不需要用户重新选包（更新走选新包，不读这份缓存）。
 * IndexedDB 不可用时退化为模块级 Map，仅保证同一次运行内可用。
 */

export type OpenPlatformPackageCacheKey = 'skill' | 'connector'

type CachedPackageRecord = {
  name: string
  type: string
  lastModified: number
  blob: Blob
}

const DATABASE_NAME = 'jiaorong-open-platform'
const STORE_NAME = 'asset-packages'
const DATABASE_VERSION = 1

const memoryPackages: Record<OpenPlatformPackageCacheKey, Map<string, File>> = {
  skill: new Map(),
  connector: new Map()
}

const buildRecordKey = (key: OpenPlatformPackageCacheKey, assetId: string): string =>
  `${key}:${assetId.trim()}`

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/** 事务封装：任何 IndexedDB 异常都收敛成 null，调用方按「没有缓存」处理。 */
function runRequest<T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDatabase().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (!database) {
          resolve(null)
          return
        }
        try {
          const transaction = database.transaction(STORE_NAME, mode)
          const request = task(transaction.objectStore(STORE_NAME))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
          transaction.oncomplete = () => database.close()
          transaction.onabort = () => database.close()
        } catch {
          database.close()
          resolve(null)
        }
      })
  )
}

function toFile(record: CachedPackageRecord): File {
  return new File([record.blob], record.name, {
    type: record.type,
    lastModified: record.lastModified
  })
}

export async function rememberOpenPlatformPackage(
  key: OpenPlatformPackageCacheKey,
  assetId: string,
  file: File
): Promise<boolean> {
  const id = assetId.trim()
  if (!id) return false
  memoryPackages[key].set(id, file)
  const record: CachedPackageRecord = {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file
  }
  const stored = await runRequest('readwrite', (store) =>
    store.put(record, buildRecordKey(key, id))
  )
  // IndexedDB 配额不足 / 被禁用时只在本次运行内有效，调用方据此提示用户
  return stored !== null
}

export async function readOpenPlatformPackage(
  key: OpenPlatformPackageCacheKey,
  assetId: string
): Promise<File | null> {
  const id = assetId.trim()
  if (!id) return null
  const cached = memoryPackages[key].get(id)
  if (cached) return cached
  const record = await runRequest<CachedPackageRecord | undefined>('readonly', (store) =>
    store.get(buildRecordKey(key, id))
  )
  if (!record) return null
  const file = toFile(record)
  memoryPackages[key].set(id, file)
  return file
}

export async function forgetOpenPlatformPackage(
  key: OpenPlatformPackageCacheKey,
  assetId: string
): Promise<void> {
  const id = assetId.trim()
  if (!id) return
  memoryPackages[key].delete(id)
  await runRequest('readwrite', (store) => store.delete(buildRecordKey(key, id)))
}
