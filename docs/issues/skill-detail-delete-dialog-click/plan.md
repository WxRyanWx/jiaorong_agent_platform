# Plan

1. 去掉易受 Electron `-webkit-app-region: drag` / 层级影响的 AlertDialog。
2. 在详情页容器内用绝对定位遮罩（不 Teleport 到 body），侧栏/顶栏保持可见。
3. 遮罩透明度沿用原 AlertDialog 的 0.8（less 中用 `rgba(0,0,0,0.8)`，避免 `/` 被当成除法）；取消 / 删除用普通 Button。
