/** 应用自定义协议与宿主 IPC 频道名。guest 与侧栏都走这些字符串，不要改拼写。 */

/** 应用页面协议 scheme，guest 只允许 `jiaorong-app://<appId>/...`。 */
export const JIAORONG_APP_PROTOCOL = 'jiaorong-app'

/** 侧栏列出当前用户可见应用。 */
export const JIAORONG_APP_LIST_CHANNEL = 'jiaorong-app:list-visible'
/** 取打开 webview 所需 src / partition / preload。 */
export const JIAORONG_APP_OPEN_CHANNEL = 'jiaorong-app:get-open-info'
/** 离开应用：停 spawn。 */
export const JIAORONG_APP_LEAVE_CHANNEL = 'jiaorong-app:leave'
/** guest `window.jiaorong.invoke` 的唯一主进程入口。 */
export const JIAORONG_APP_BRIDGE_INVOKE_CHANNEL = 'jiaorong-app:bridge-invoke'
/** 主进程把会话/流式事件推给本应用 guest。 */
export const JIAORONG_APP_BRIDGE_EVENT_CHANNEL = 'jiaorong-app:bridge-event'
/** OSS 目录变化后通知侧栏刷新。 */
export const JIAORONG_APP_CATALOG_CHANGED_CHANNEL = 'jiaorong-app:catalog-changed'
