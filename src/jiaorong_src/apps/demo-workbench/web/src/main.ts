/**
 * Vue 应用入口。
 * 挂上 Hash 路由后渲染 App.vue；全局样式在 style.css。
 */
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router/index'
import './style.css'

createApp(App).use(router).mount('#app')
