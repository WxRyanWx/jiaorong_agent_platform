/** 聊天消息窗口策略（宿主只引用，勿在开源路径散落硬编码） */

/** 首屏 restore 条数。ChatPage 与 message store 共用。 */
export const INITIAL_MESSAGE_RESTORE_COUNT = 10

/** 上滑分页条数。 */
export const OLDER_MESSAGE_PAGE_SIZE = 20

/** 距顶多少 px 开始静默预取更早历史。 */
export const TOP_HISTORY_PREFETCH_PX = 300
