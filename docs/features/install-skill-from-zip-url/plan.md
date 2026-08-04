# Plan

1. 渲染进程 `fetch` 下载 zip **一次** → `writeTemp`
2. `installFromZip(overwrite:false)`
3. 冲突则弹确认；确认后对**同一临时 zip** `installFromZip(overwrite:true)`
4. 不二次请求 URL（避免宿主 `installFromUrl` 成功/失败都会删临时文件导致重下）
