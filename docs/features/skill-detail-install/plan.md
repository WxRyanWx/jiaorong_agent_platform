# Plan

1. 详情页未安装分支改为安装按钮；`handleInstall` 复用列表页
   `installSkillFromZipUrl` + `rememberSkillSource` / `rememberRemoteInstall`。
2. 安装成功后更新 session 与 `installed`，必要时 `router.replace` 到本地技能名。
3. 将 vue 内 scoped less 原样迁入 `index.less`，`import './index.less'`。
4. 运行 format / i18n / lint。
