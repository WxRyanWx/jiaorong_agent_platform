# 开放平台一期 Implementation Plan

## 总体思路

一期在客户端内新增闭环的开放平台模块，并把现有开发者中心的交融应用交互迁入该模块。页面、状态、API client、能力适配器和样式集中维护，业务层不直接感知 Electron 或外层路由，为二期独立部署预留边界。

分期切分：

- **一期只做客户端内嵌实现**，包含全部业务功能和独立部署架构铺垫。
- **二期只做部署形态切换**，包含独立构建、云端部署、SSO、iframe 白名单桥和客户端地址切换。
- 一期不实现 SSO、iframe 桥和云端部署；但业务代码不得直接依赖 Electron preload、客户端路由或客户端全局 IPC。

## 目标结构

```text
src/jiaorong_src/open-platform/
├─ router/                  # 开放平台内部 tab 路由与持久化
├─ api/                     # 开放平台 API 适配层与 mock client
├─ capabilities/            # 客户端 / 浏览器能力适配器
├─ stores/                  # 模块内状态
├─ pages/                   # Home、Apps、Skills、Connectors
├─ components/              # tab、卡片、发布、上传、确认等组件
└─ styles/                  # 模块样式
```

现有 `appHost/devCenter` 中可复用的本地应用能力保留在原主进程边界，开放平台渲染层通过 capability adapter 调用，避免复制主进程逻辑。

## 架构分层

1. **API 层**：对外映射 3 个统一资产管理接口，内部可按 `type` 提供分模块 client 方法；封装分页、错误结构、幂等 key、multipart 上传和列表循环拉取。
2. **能力层**：定义 `selectDirectory`、`openDebugApp`、`revealDirectory`、`getApiBaseUrl`、`getAuthToken` 等接口；客户端实现转发现有 typed bridge，浏览器实现为空或降级。
3. **状态层**：维护 tab、交融应用合并列表、技能管理列表、连接器管理列表、市场列表、上传 / 发布请求序号。
4. **页面层**：只消费状态与能力，不拼接 URL、不读取 preload、不处理平台分支细节。
5. **集成层**：插件中心按现有数据结构合并远程 MCP；应用安装链路读取服务端市场数据。

## 数据流

### 交融应用

```text
本地目录 → 现有 devCenter 主进程校验 → 本地卡片
发布 / 更新 → POST /assets?type=app&mode=publish → 服务端记录
GET /assets?type=app&scope=mine + 本地卡片 → 按 app id 合并
GET /assets?type=app&scope=market → 插件中心应用市场 / 安装链路
```

### 技能

```text
上传 skill.zip → 前端解析确认 → POST /assets?type=skill&mode=draft / publish
服务端保存草稿或资产 / 当前发布包 → 同步现有技能市场数据源
GET /assets?type=skill&scope=mine → 开放平台管理列表
现有技能市场接口 → 插件中心技能列表
```

### 连接器

```text
上传 connector.zip → 前端解析确认 → POST /assets?type=connector&mode=draft / publish
服务端保存资产 / 当前发布包 → 生成 MCPServerConfig
GET /assets?type=connector&scope=market → 插件中心远程 MCP 列表
本地 MCP + 远程 MCP → 按服务 ID 合并 → 现有启动流程
```

## 兼容性

- `slot` 只隐藏表单选择，不改变解析、默认值和展示逻辑。
- `source=builtin` 继续固定进菜单栏；`source=store` 按包内合法 `slot` 展示。
- 交融应用未发布本地卡片不入服务端，浏览器不可见。
- 生产 / 调试进程冲突处理保持现状，不引入新的目录切换机制。
- 技能市场沿用现有接口，不新增远程技能列表接口。
- MCP 本地同 ID 优先，远程只补充市场能力，不自动覆盖本地配置。

## 实现切片

1. 建立开放平台闭环目录、tab 路由、持久化和首页占位。
2. 建立 API client 与环境 capability adapter。
3. 迁移交融应用页面，保留现有本地能力和交互。
4. 接入交融应用列表合并、发布、更新、下架和 `auth` 表单。
5. 实现技能发布、管理列表、更新和下架。
6. 实现连接器发布、管理列表、更新和下架。
7. 接入插件中心远程 MCP 合并和技能市场数据源。
8. 接入客户端应用市场 / 安装链路。
9. 补齐错误、分页、幂等、请求序号和浏览器降级细节。
10. 做跨端手工验证和回归。

## 测试策略

- API client：响应包装、错误映射、分页循环、multipart 字段和幂等 header 单测。
- 状态层：本地卡片与服务端记录合并、请求过期响应、发布状态回退、tab 恢复。
- 包校验：沿用现有交融应用、技能、MCP 校验边界；只测试契约要求的行为。
- 组件：发布弹窗、技能 / 连接器上传确认、浏览器能力降级。
- 集成：插件中心远程 MCP 合并、本地同 ID优先、启动流程不回退。
- 回归：现有开发者中心创建、打开、发布更新、移除和进程冲突行为。

## 手工验证矩阵

| 场景 | 客户端 | 浏览器 |
| --- | --- | --- |
| tab 持久化 | 必测 | 必测 |
| 交融应用本地创建 / 打开 | 必测 | 不适用 |
| 交融应用发布 / 更新 / 下架 | 必测 | 必测 |
| 技能发布 / 更新 / 下架 | 必测 | 必测 |
| 连接器发布 / 更新 / 下架 | 必测 | 必测 |
| 插件中心合并远程 MCP | 必测 | 不适用 |
| 应用市场安装 | 必测 | 不适用 |
