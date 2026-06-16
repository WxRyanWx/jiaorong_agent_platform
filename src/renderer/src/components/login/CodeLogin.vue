<template>
  <div class="d">
    <Spin v-show="props.isCheck" :loading="isLoading">
      <div class="codeLogin-page">
        <iframe
          v-show="!isLoading"
          id="scanderLoading"
          class="iframe-codelogin"
          src="https://jjt.ccccltd.cn/wwopen/sso/qrConnect?state=jrdeepchatclient&appid=wl2c5e89d5c4&agentid=1002969&redirect_uri=https%3a%2f%2fc4ai.ccccltd.cn%2fapi%2fauth%2flogin%2fjjt"
        >
        </iframe>

        <div v-show="!props.isCheck" class="txt-cont"></div>
      </div>
    </Spin>
    <div v-if="!props.isCheck" class="code-cont">
      <div class="l">请查阅并同意</div>
      <div class="l">《交融超级智能体用户服务协议》</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Spin } from '@arco-design/web-vue'
import { onMounted, ref } from 'vue'

const isLoading = ref(true)
const props = defineProps({
  isCheck: {
    type: Boolean,
    default: false
  }
})

onMounted(() => {
  const scanderLoadingDom = document.getElementById('scanderLoading')
  if (scanderLoadingDom) {
    scanderLoadingDom.onload = () => {
      isLoading.value = false
    }
  }
})
</script>

<style lang="less" scoped>
.codeLogin-page {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 360px;
  height: 350px;
  margin-top: 9px;
  overflow: hidden;
  cursor: pointer;

  .iframe-codelogin {
    width: 100%;
    height: 100%;
    margin-top: -29px;
    overflow: hidden;
    border: none;
  }
}

.code-cont {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 240px;
  height: 240px;
  margin: 0 auto;
  margin-top: 29px;
  margin-bottom: 90px;
  color: #1d2129;
  font-weight: 600;
  font-size: 14px;
  line-height: 22px;
  background: url('@/assets/login/not-code.png');
  background-position: center center;
  border-radius: 6px;
}

.txt-cont {
  position: absolute;
  bottom: 14px;
  left: 50%;
  width: 250px;
  height: 68px;
  background: #fff;
  transform: translateX(-50%);
}
</style>
