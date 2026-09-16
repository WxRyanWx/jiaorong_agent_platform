# Node 转发

`app.json.spawn` 为 `node node/server.js`。用 `egg.start` 单进程。从 8787 起 listen。页面经 WebSocket 把对话请求发给本进程；本进程再让页面代调 `window.jiaorong`。宿主不注入通信。
