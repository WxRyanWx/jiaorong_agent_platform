# Plan

1. `installNormalizedZipBytes`：目录名改为 `deriveTechnicalSkillName(content, pathHint)`，与文件夹打包一致
2. 上传对话框覆盖：先 `uninstallSkill` 再装；冲突检测兼容缺 errorCode
3. Win picker：选文件后抑制幽灵点击 + 结束时强制关闭类型菜单
4. 宿主 `backupExistingSkill`：失败时回退为 copy+rm（其它覆盖入口也受益）
5. 单测：同内容 zip/folder 导出相同 technical name
