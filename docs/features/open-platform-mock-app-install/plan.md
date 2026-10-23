# 实施计划

## 数据流

1. 开放平台发布表单选择 zip 后，把 zip 路径随发布输入传给 mock API。
2. mock API 将路径保存在本地 mock 数据中，不进入后端契约类型。
3. 插件中心拉取 mock 市场列表时，读取该路径并转成应用中心卡片的本地包信息。
4. 点击安装后，渲染进程通过 IPC 调用主进程本地包安装。
5. 主进程校验访问权限、路径与包 id，调用现有 `installAppFromPackage`。
6. 安装成功后通知目录变化并刷新，本地扫盘结果提供打开能力。
7. 打开应用时记录当前插件中心壳路由，返回按钮按该路由回到来源列表。

## 改动接口

- `JiaorongAppCenterItem` 增加可选 `localPackagePath`，仅用于渲染进程传递 mock 本地包。
- 新增应用中心本地包安装 IPC：`jiaorong-app-center:install-package`。
- preload 暴露 `installAppCenterPackage(appId, packagePath)`。
- 新增应用中心安装状态 IPC：`jiaorong-app-center:install-statuses`，供 mock 市场卡片合并本地已装状态。

## 已知边界

本地包安装后会落入用户应用目录；若该 id 同时登记在开发者中心，普通应用中心列表会按既有规则过滤本地调试来源。因此 mock 市场卡片需要按 id 查询轻量安装状态，不能用 `getOpenInfo`，避免列表阶段启动应用 Node 进程。

## 兼容性

- 旧 mock 数据没有本地包路径时仍可展示，但没有安装按钮；重新发布后会记录路径。
- 后端接入后不再提供 `localPackagePath`，页面自然回到远端安装逻辑。
- 已安装应用由本地扫盘结果接管，与远端/mock 展示数据合并逻辑保持不变。

## 验证

运行类型检查和相关单测；检查应用中心组件、mock API 与 IPC 的类型一致性。
