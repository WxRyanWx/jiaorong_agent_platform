# Plan: jiaorong-host-thinning-p0

## Approach

1. SM4：`public/sm4` → `jiaorong_src/auth/vendor/sm4`；`ensureSm4Loaded` 按需注入；`index.html` 去掉全局 script；登录加密前 await。
2. 删除未使用的 `public/fuwuxueyi.docx`（协议已走远程 URL）。
3. `settingsSidebarAdmin.ts` → `jiaorong_src/config/`；`@shared` 薄 re-export。
4. `DEFAULT_SYSTEM_PROMPT` → `jiaorong_src/prompts/`；`systemPromptHelper` 引用。
5. 更新 HOST_TOUCHPOINTS + 验证名单。

## Risks

- SM4 动态加载时序：加密前必须 await ensure。
- `byte&string.js` 文件名含 `&` + Vite `?url` 小文件会内联成 `data:` → 已改为 `byte-string.js` + `?raw` 同步注入。
