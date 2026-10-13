# 开发者中心实现方案

## 数据流

```
DevCenterPage
  ├─ localStorage jiaorong-dev-apps:<identity>.json
  │    └─ sync IPC → 主进程内存名单
  ├─ list IPC → 重拉远端配置 → 本地卡片 + publishedVersion
  ├─ create IPC → 选择目录 + 校验 app.json
  ├─ open-window IPC → 临时 link + 独立调试窗口
  ├─ publish IPC → 校验 ID / 版本 → 生成并清理校验 zip
  ├─ pick-zip / peek-zip IPC → 发布表单选包与回填
  └─ remove → 更新当前身份存储 → 同步主进程
```

## 模块

- `src/jiaorong_src/appHost/devCenter/main/devApps.ts`：本地登记内存镜像与目录校验。
- `src/jiaorong_src/appHost/devCenter/main/devCenter.ts`：列表、创建、发布校验。
- `src/jiaorong_src/appHost/devCenter/main/devAppWindow.ts`：调试窗口与生产来源切换。
- `src/jiaorong_src/appHost/devCenter/main/devZip.ts`：发布 zip 读取与回写。
- `src/jiaorong_src/appHost/devCenter/renderer/DevCenterPage.vue`：开发者中心页面。
- `src/jiaorong_src/appHost/devCenter/renderer/DevAppWindowRail.vue`：调试窗口侧边栏。
- `src/jiaorong_src/appHost/devCenter/renderer/useJiaorongDevCenter.ts`：页面状态与 IPC 数据源。

## 兼容性

- 应用中心安装、卸载、普通应用打开语义不变。
- 调试 link 只在调试窗口打开期间存在。
- 发布占位阶段不保留临时 zip；后端接入后应上传并删除服务端拒绝的临时包。

## 测试

- 主进程：清单校验、登记同步、发布更新与 zip 解析。
- 渲染端：现有 Jiaorong 渲染测试与类型检查。
- 手工：创建、打开、切换生产、发布、更新、移除、重启恢复。
