import { createRouter, createWebHashHistory } from 'vue-router'
import DirectChatPage from './pages/DirectChatPage.vue'
import HttpChatPage from './pages/HttpChatPage.vue'

// / = 页面 connect SDK；/node = 只 HTTP，Node 才 connect。
export const router = createRouter({
  // jiaorong-app:// 下必须用 Hash。History 模式刷新会 404。
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'direct', component: DirectChatPage },
    { path: '/node', name: 'http', component: HttpChatPage }
  ]
})

