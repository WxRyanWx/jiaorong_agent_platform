/**
 * Vue 应用入口。
 * 先连包内 Node 的桥，再挂 Hash 路由渲染 App.vue；全局样式在 style.css。
 */
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router/index'
import { NODE_PORT } from './constants'
import './style.css'

const bootstrap = async () => {
  // 端口与包内 Node 的桥一致；第二个参数是页面自定义方法，Node 用 jr.apisCustom.<名字>() 调
  const bridge = await window.initRendererBridge?.(NODE_PORT, {
    // 回当前路由，Node 打日志时能看出页面停在哪一屏
    currentRoute: () => window.location.hash || '#/'
  })
  // 页面卸载时关桥并停止重连，避免刷新后新旧两个页面同时转发事件
  window.addEventListener('pagehide', () => bridge?.stop())
  createApp(App).use(router).mount('#app')
}

bootstrap()
