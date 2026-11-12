# 插件中心交融应用详情（plan）

## 实现思路

详情只读 `JiaorongAppCenterItem`。市场列表已有上架时间与最近更新，映射进卡片后在详情里展示；没有的字段不占一行。

侧边栏用 Teleport 挂到 body，遮罩与宽度对齐反馈抽屉。卡片版本号后放绿色对号，用现有 Tooltip 显示安全检查文案。

## 受影响文件

- `src/jiaorong_src/appHost/types.ts`：增加可选 `publishedAt`、`updatedAt`
- `src/jiaorong_src/plugins/market/openPlatformMarket.ts`：市场卡片带上这两个时间
- `src/jiaorong_src/appHost/appCenter/renderer/useJiaorongAppCenter.ts`：合并远端卡片时保留时间
- `src/jiaorong_src/appHost/appCenter/renderer/AppCenterPage.vue`：详情按钮与对号
- `src/jiaorong_src/appHost/appCenter/renderer/AppCenterDetailDrawer.vue`：侧边栏
- `src/jiaorong_src/appHost/appCenter/renderer/AppCenterPage.less`：对号样式
- `src/renderer/src/i18n/*/routes.json`：新增文案键

## 安装包大小

`GET /assets/{type}/{id}/package` 经常不带 `Content-Length`。探测顺序：

1. `HEAD`，读大于 0 的 `Content-Length`。
2. `GET Range: bytes=0-0`，读 `Content-Range` 的总长度。
3. Range 响应里的 `Content-Length` 可能只是那 1 个字节，不拿来当整包大小。
4. 上面都没有总长度时，再发一次普通 `GET`。有长度头就立刻停；没有就把包体按块累计后丢掉。

结果按下载地址缓存在主进程，详情重复打开不再读包。

## 测试

- 现有应用中心单测仍通过，合并卡片后时间字段不丢。
- 包大小：空长度不当成 0；没有长度头时按包体字节数返回。
- 不新增只断言模板结构的测试。
