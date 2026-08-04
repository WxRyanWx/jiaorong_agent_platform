# 方案

1. `installLocalSkill`：规范化文件夹时 registerWorkspace → 递归列文件 → 打完整 zip（SKILL.md 已 patch）  
2. `responseErrorFn`：复用 API_SUCCESS_CODES；非 401 业务码只 callback(3)，不清 storage  
3. `skillSwitch`：首次读 map 时从 config hydrate（config 为准；local 有而 config 空则回写）  
4. `toFileUrl`：统一 `\`→`/`，盘符 `C:/` → `file:///C:/...`  
