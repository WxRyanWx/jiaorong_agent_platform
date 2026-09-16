/**
 * 脚手架路由。
 * 必须用 Hash：Vite base 是 './'，侧栏用 file / 自定义协议打开，History 模式会丢路径。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import ChatPage from '../pages/ChatPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'chat', component: ChatPage },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
