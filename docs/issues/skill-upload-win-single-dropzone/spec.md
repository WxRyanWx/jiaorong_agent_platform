# skill-upload-win-single-dropzone

## Goal

Windows / Linux 技能上传保持与 macOS 一致的「单一上传区」交互：不另挂「选择文件夹」外链；同一 dropzone 可覆盖 zip / md / 文件夹。

## Constraint

Electron `dialog.showOpenDialog` 在 Win/Linux 上不能同时 `openFile` + `openDirectory`（会退化成只选目录）。无法做到与 Finder 完全相同的原生同框选择。

## Acceptance

- 视觉上只有一个上传区（无常驻「选择文件夹」链接）
- macOS：点击直接打开可同框选文件/文件夹的系统对话框
- Win/Linux：点击后在上传区内弹出类型菜单（文件 / 文件夹），再进入对应系统对话框
- 拖拽：三端均可直接拖入文件或文件夹

## Non-Goals

- 自研完整文件浏览器以模拟 macOS 同框选择
- 修改宿主 `devicePresenter.selectFiles` 的跨平台语义（仍由私有层按平台分流）
