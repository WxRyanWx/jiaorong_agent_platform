/**
 * 脚手架路由。
 * 必须用 Hash：Vite base 是 './'，侧栏用 file / 自定义协议打开，History 模式会丢路径。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import DirectChatPage from '../pages/DirectChatPage.vue'
import HttpChatPage from '../pages/HttpChatPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // #/ ：页面自己直连宿主
    { path: '/', name: 'direct', component: DirectChatPage },
    // #/node ：页面自己走本应用 Node HTTP
    { path: '/node', name: 'http', component: HttpChatPage }
  ]
})
