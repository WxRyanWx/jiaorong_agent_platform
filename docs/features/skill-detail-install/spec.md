# Skill detail install action

## User Need

未安装的远程技能详情页，操作区应展示「安装」而非「使用技能」；点击后用
sessionStorage `jiaorongSkill.metadata.downloadUrl` 安装，逻辑与列表页一致。
同时将详情页样式抽到同目录 `index.less`。

## Acceptance Criteria

- 未安装时展示安装按钮；安装中禁用并显示「安装中」。
- 下载地址取自 session `metadata.downloadUrl`；缺失时 toast 提示失败。
- 安装成功后：记录来源/远程映射、更新 session、切到已安装 UI。
- 样式全部移入 `SkillDetailPage/index.less`，vue 内无 `<style>`。

## Non-goals

- 抽取列表与详情共用的 install helper（可后续再做）。
- 改动已安装态的使用/打开/删除按钮。
