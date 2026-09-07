<!--
  脚手架壳：两个示例页。
  #/ 直连宿主；#/node 只 HTTP 到本机 Egg，再由 Node connect SDK。
-->
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="shell">
    <header class="bar">
      <strong>应用脚手架</strong>
      <nav>
        <RouterLink to="/">直连对话</RouterLink>
        <RouterLink to="/node">Node HTTP</RouterLink>
      </nav>
    </header>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
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
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
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
