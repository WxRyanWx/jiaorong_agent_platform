# 开放平台目录边界划分（spec）

## 背景

`src/jiaorong_src/open-platform/` 后续要整体迁出客户端（独立仓库 / 独立部署）。
但上传后的资产仍要在客户端插件中心展示与启用（技能、连接器、应用），
这部分「远端资产 → 插件中心模型」的代码原本写在 open-platform 目录内，
目录一迁走，插件中心就会编译失败。

## 用户需求

1. 把 open-platform 目录里**与开放平台无关**的代码迁到交融私有目录。
2. open-platform 目录迁走后，客户端其余功能正常使用。
3. 不引入额外的抽象层：open-platform 反向依赖客户端内容可以保留，
   迁出时把相关依赖一起复制过去即可。

## 目标

- 客户端（`src/renderer`、`src/main`、`src/preload` 与 `jiaorong_src` 其余模块）
  不再 import `open-platform/` 内部的实现文件。
- 插件中心所需的接口 client、契约类型、市场映射、连接器落地逻辑落在客户端常驻目录。
- open-platform 目录只保留平台自身职责：页面、上传解析、样式、页面级 composable。

## 验收标准

- [x] `rg "@jiaorong/open-platform" src/renderer src/main src/preload` 无结果。
- [x] `jiaorong_src` 内除 `router/apps.ts` 的页面路由 loader 外，无其他模块 import open-platform。
- [x] `pnpm run typecheck`、`pnpm run lint`、`pnpm run i18n`、相关测试全部通过。
- [x] 连接器启用、工具调用、下架移除等既有行为不变（测试与手工验证）。
- [ ] 迁出演练：把 `open-platform/` 临时移出仓库，客户端除「开放平台入口与页面」外
      仍能编译启动，插件中心三个 Tab 正常显示本地数据（交付前手工执行并记录结果）。

## 约束

- 不改主进程与 preload（原本对 open-platform 零引用，保持）。
- 不改已跑通的启动链路：`toggleServer → setMcpServerEnabled → startServer → mcpClient`。
- 遵循 `jiaorong_src/README.md` 约定：调后端放 `api/`，路由只加 `router/`，
  改主仓记入 `HOST_TOUCHPOINTS.md`。
- 只做目录归位与 import 路径调整，不重写逻辑、不引入注册表或动态发现机制。

## 非目标

- 不做端口 / 适配器 / 插件注册表等抽象解耦（需求方明确否决）。
- 不处理 open-platform 对客户端 `appHost`、`config`、`auth`、`assets` 的反向依赖，
  这些在迁出时随目录一起复制。
- 不做真实后端接入（仍用 mock client）。
- 不做远端资产版本同步（见 `docs/features/remote-asset-version-sync/`）。

## 边界界定

开放平台**入口本身**（侧栏按钮、`/open-platform` 路由、平台页面）属于开放平台功能，
迁出时随之移除或改为外链，不属于「客户端正常使用」的范围。
需要保证的是：插件中心、MCP 设置、技能中心、应用中心等**其他功能**不受影响。
