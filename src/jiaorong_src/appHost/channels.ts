/** 应用自定义协议与超级智能体 IPC 频道名。guest 与侧栏都走这些字符串，不要改拼写。 */

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
/** 应用中心列出当前用户可见的远程应用。 */
export const JIAORONG_APP_CENTER_LIST_CHANNEL = 'jiaorong-app-center:list'
/** 应用中心安装 / 更新：下载 zip 并解压安装。 */
export const JIAORONG_APP_CENTER_INSTALL_CHANNEL = 'jiaorong-app-center:install'
/** 应用中心卸载：仅开发者。 */
export const JIAORONG_APP_CENTER_UNINSTALL_CHANNEL = 'jiaorong-app-center:uninstall'
/** 开发者中心列出示例应用与本地登记应用。 */
export const JIAORONG_DEV_CENTER_LIST_CHANNEL = 'jiaorong-dev-center:list'
/** 开发者中心创建应用：选目录 + 校验 app.json。 */
export const JIAORONG_DEV_CENTER_CREATE_CHANNEL = 'jiaorong-dev-center:create'
/** 开发者中心发布：接口未接入前的占位提交。 */
export const JIAORONG_DEV_CENTER_PUBLISH_CHANNEL = 'jiaorong-dev-center:publish'
/** 开发者中心示例应用下载：选目录后落 zip。 */
export const JIAORONG_DEV_CENTER_DOWNLOAD_CHANNEL = 'jiaorong-dev-center:download'
/** 开发者中心发布表单：选择 zip 包。 */
export const JIAORONG_DEV_CENTER_PICK_ZIP_CHANNEL = 'jiaorong-dev-center:pick-zip'
/** 开发者中心发布表单：读取 zip 内 app.json。 */
export const JIAORONG_DEV_CENTER_PEEK_ZIP_CHANNEL = 'jiaorong-dev-center:peek-zip'
/** 侧栏入口：打开开发者中心独立窗口。 */
export const JIAORONG_DEV_CENTER_OPEN_WINDOW_CHANNEL = 'jiaorong-dev-center:open-window'
/** 渲染把浏览器存储的开发者名单同步给主进程。 */
export const JIAORONG_DEV_CENTER_SYNC_CHANNEL = 'jiaorong-dev-center:sync'
/** OSS 目录变化后通知侧栏刷新。 */
export const JIAORONG_APP_CATALOG_CHANGED_CHANNEL = 'jiaorong-app:catalog-changed'
