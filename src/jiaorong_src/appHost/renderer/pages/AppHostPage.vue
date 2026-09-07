<script setup lang="ts">
defineOptions({ name: 'AppHostPage' })
</script>

<template>
  <!--
    webview 不放在路由页里。切菜单会卸载路由组件，Electron 会拆掉 guest。
    真正的 webview 在 ChatMainApp 里常驻的 JiaorongAppFrameHost。
  -->
  <div class="jiaorong-app-host" />
</template>

<style scoped>
.jiaorong-app-host {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
