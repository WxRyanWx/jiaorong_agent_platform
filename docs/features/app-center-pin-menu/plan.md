# 交融 AI 应用钉到左侧菜单（plan）

## 数据流

1. 卡片点击调用 `jiaorongApps.pinAppToMenu(appId, pinned)`。
2. 主进程确认应用已安装、可见，且不是发布包自带的菜单位，然后改 `~/.jiaorongchat/pinned-menu-apps.json`。
3. 广播目录变化。侧栏 `listVisible` 在原有 `slot=menu` 之外，加上偏好里的已安装应用。
4. 卸载成功后从偏好删除该 id，再广播。侧栏列表不再包含未安装应用。

## 受影响位置

- `src/jiaorong_src/appHost/main/pinnedMenuApps.ts`：读写钉偏好。
- `src/jiaorong_src/appHost/main/scan.ts`：侧栏是否展示。
- `src/jiaorong_src/appHost/main/register.ts`：钉的 IPC。
- `src/jiaorong_src/appHost/appCenter/main/appCenter.ts`：卡片带上钉状态；卸载时清偏好。
- `src/jiaorong_src/plugins/market/openPlatformMarket.ts`：市场卡沿用安装状态上的钉标记。
- `src/jiaorong_src/appHost/appCenter/renderer/AppCenterPage.vue`：对号旁的钉和悬停文案。
- preload 与 `JiaorongAppCenterItem`。

## 兼容

旧客户端没有这份偏好文件时，侧栏行为与现在一致。不迁移 `app.json`。

## 测试

- 偏好文件的写入、取消、损坏文件。
- 覆盖一份假的 `app.json` 后，钉的 id 仍在，且 `slot=app-center` 仍算侧栏项。
- 忘掉 id 后不再算侧栏项。
- 卡片状态：未安装、发布包菜单、已钉、未钉。
