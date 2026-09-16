<!--
  脚手架壳：顶栏、路由出口，以及本页调试按钮。
-->
<script setup lang="ts">
import { RouterView } from 'vue-router'
import { shallowRef } from 'vue'
import { formatError } from './lib/formatError'
import { getActiveNodeClient } from './lib/hostRelay'

/** 打开调试台失败时的短文案；成功则清空。 */
const debugError = shallowRef('')

/** 经 Node 让宿主弹出本应用页面的独立 DevTools。 */
async function openDebug() {
  debugError.value = ''
  try {
    const client = getActiveNodeClient()
    if (!client) {
      throw new Error('正在连接应用后端…')
    }
    await client.invoke('devtools.open')
  } catch (error) {
    debugError.value = formatError(error)
  }
}
</script>

<template>
  <div class="shell">
    <header class="bar">
      <strong>应用脚手架</strong>
      <nav>
        <button type="button" class="debug" @click="openDebug">打开调试台</button>
        <span v-if="debugError" class="debug-err">{{ debugError }}</span>
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
  background: #eff5ff;
}

nav {
  display: flex;
  gap: 16px;
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
