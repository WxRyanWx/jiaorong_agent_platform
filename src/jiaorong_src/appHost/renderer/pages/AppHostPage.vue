<script setup lang="ts">
// 组件名固定，供路由匹配、keep-alive 与调试面板识别
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
/* 占位容器：撑满路由出口；真正的 webview 在常驻宿主 JiaorongAppFrameHost 里 */
.jiaorong-app-host {
  width: 100%;
  height: 100%;
  /* 允许被父级压缩，避免撑破布局 */
  min-width: 0;
  min-height: 0;
}
</style>
