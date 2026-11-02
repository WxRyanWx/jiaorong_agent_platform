# 实现计划

1. 在开放平台页新增 `knowledge-center` Tab。
2. 知识中心地址统一为单一常量；生产与测试同址，切换正式域名只改一处。
3. 从现有登录态或请求封装中读取 `xkaitoken`。
4. 拼接 `token` 查询参数并渲染 iframe。
5. 增加最小渲染验证。
6. iframe 常驻挂载，仅按 `activeTab` 切换显隐（`v-show`），避免切走即销毁导致重载。
7. 开放平台路由开启 `keepAlive`，切到其它菜单不卸载页面；子面板在 `onActivated` 时补一次数据同步。
8. iframe URL 只在首次进入与 token 变化时赋值，避免重复赋同一 `src` 触发整页重载。
