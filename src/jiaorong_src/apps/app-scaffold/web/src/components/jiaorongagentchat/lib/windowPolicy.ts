/**
 * 会话列表与消息窗口的分页阈值。
 * 给 runtime 拉历史、会话列表滚动加载，以及消息区触顶预取使用。
 */

/** 首次进入会话时还原的最近消息条数。 */
export const INITIAL_MESSAGE_RESTORE_COUNT = 10
/** 向上滚动再拉更早消息时，每页条数。 */
export const OLDER_MESSAGE_PAGE_SIZE = 20
/**
 * 消息列表距顶部小于该像素时预取更早历史。
 * 单位：px。
 */
export const TOP_HISTORY_PREFETCH_PX = 300
/** 会话列表首次拉取条数。 */
export const INITIAL_SESSION_PAGE_SIZE = 10
/** 会话列表继续向下加载时，每页条数。 */
export const OLDER_SESSION_PAGE_SIZE = 20
/**
 * 会话列表距底部小于该像素时加载更多。
 * 单位：px。
 */
export const SESSION_LIST_LOAD_MORE_PX = 80
