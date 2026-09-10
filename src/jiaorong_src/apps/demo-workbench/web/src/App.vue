<!--
  脚手架壳：顶栏、路由出口，以及本页调试按钮。
  连接、智能体、会话都在各个页面自己完成，复制其中一个页面即可单独使用。
-->
<script setup lang="ts">
import { connect } from 'jiaorong-app-sdk'
import { RouterLink, RouterView } from 'vue-router'
import { shallowRef } from 'vue'
import { APP_ID } from './constants'
import { formatError } from './lib/formatError'

/** 打开调试台失败时的短文案；成功则清空。 */
const debugError = shallowRef('')

/** 弹出本应用页面的独立 DevTools。不 disconnect，避免误断各页共用的连接。 */
async function openDebug() {
  debugError.value = ''
  try {
    const jr = await connect({ appId: APP_ID })
    await jr.openDevTools()
  } catch (error) {
    debugError.value = formatError(error)
  }
}
</script>

<template>
  <div class="shell">
    <!-- 顶栏：两个示例页入口，高亮当前路由 -->
    <header class="bar">
      <strong>应用脚手架</strong>
      <nav>
        <RouterLink to="/">直连对话</RouterLink>
        <RouterLink to="/node">Node HTTP</RouterLink>
        <button type="button" class="debug" @click="openDebug">打开调试台</button>
        <span v-if="debugError" class="debug-err">{{ debugError }}</span>
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

.debug {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #1677ff;
  cursor: pointer;
  font: inherit;
}

.debug-err {
  color: #b42318;
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
