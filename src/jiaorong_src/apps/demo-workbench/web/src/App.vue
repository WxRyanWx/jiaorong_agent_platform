<!--
  脚手架壳：只负责顶栏和路由出口。
  连接、智能体、会话都在各个页面自己完成，复制其中一个页面即可单独使用。
-->
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="shell">
    <!-- 顶栏：两个示例页入口，高亮当前路由 -->
    <header class="bar">
      <strong>应用脚手架</strong>
      <nav>
        <RouterLink to="/">直连对话</RouterLink>
        <RouterLink to="/node">Node HTTP</RouterLink>
      </nav>
    </header>
    <!-- 页面内容：#/ 直连，#/node HTTP -->
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/* 纵向铺满 webview，避免子页把宿主撑出滚动条 */
.shell {
  display: flex;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  background: #eff5ff;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #eff5ff;
}

nav {
  display: flex;
  gap: 16px;
}

nav a {
  color: #4b5563;
  text-decoration: none;
}

nav a.router-link-active {
  color: #1677ff;
  font-weight: 600;
}

.main {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}
</style>
