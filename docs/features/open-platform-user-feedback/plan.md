# 开放平台用户反馈（plan）

## 实现思路

顶栏按钮和右侧面板放在开放平台页面内。面板用 Teleport 挂到 `body`，避免被问答中心 iframe 盖住。

接口复用 `api/auth` 的 axios 实例。`baseURL`、Fusion-Auth、Product-Id 已按 Vite mode 区分测试服和正式服，反馈接口不再单独配地址。

| 能力 | 方法 | 路径 |
| --- | --- | --- |
| 上传截图 | POST | `sys-storage/upload`（multipart 字段 `file`） |
| 提交反馈 | POST | `fusion-ai/userFeedback/add`，body `{ comment, rating }` |
| 未读回复 | GET | `userFeedbackReply/getIsRead`，`0` / `false` 视为未读 |
| 反馈记录 | POST | `fusion-ai/userFeedback/list`，`{ pageNo, pageSize, createBy }` |

网页端把 `getIsRead` 用作未读红点，列表另走 `userFeedback/list`。记录页必须有列表，因此两者都接。`createBy` 取本地 `userInfo.userName`。

内容区用 contenteditable。粘贴图片时校验类型、大小和张数，上传成功后插入带 `data-f8s` 的图片；提交时拼成：

`<p><img src="/api/sys-storage/download?f8s=TOKEN" alt="" data-href="" style=""/>文字</p>`

输入区预览用本地 object URL。历史记录里的图片再带鉴权下载。

## 受影响文件

- `src/jiaorong_src/api/userFeedback/`：请求与类型
- `src/jiaorong_src/open-platform/renderer/feedbackContent.ts`：正文读写
- `src/jiaorong_src/open-platform/renderer/FeedbackEntry.vue`：按钮和面板
- `src/jiaorong_src/open-platform/renderer/OpenPlatformPage.vue`：挂到顶栏
- `src/jiaorong_src/open-platform/assets/appraise-logo.png`：客服插图
- `src/jiaorong_src/open-platform/styles/open-platform.less`：顶栏按钮

## 测试

- 正文拼装、粘贴内容读取、未读判断
- 四个接口的路径、静默头和成功 / 失败信封
