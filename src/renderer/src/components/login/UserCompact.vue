<template>
  <Modal
    :visible="props.visible"
    :hide-title="true"
    :footer="false"
    :body-style="{
      display: 'flex',
      padding: '0px',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100%'
    }"
    :modal-style="{ maxHeight: '780px', height: '90%' }"
    class="model-cont"
    :width="props.iswidth > 856 ? 640 : props.iswidth * 0.8"
    @cancel="handleCancel"
  >
    <div class="model-title" @click="handleCancel">
      交融超级智能体用户服务协议
      <IconClose class="close-btn" />
    </div>
    <div class="leval-img" :class="{ 'is-padding': !props.isShow }">
      <div v-if="isload" v-html="docxContent"></div>
    </div>
    <div v-if="props.isShow" class="bott-box">
      <Tooltip content="取消同意将退出平台登录">
        <Checkbox v-model="checked" @change="changeCheck"> </Checkbox>
      </Tooltip>
      <span>我已阅读并同意《交融超级智能体用户服务协议》</span>
    </div>
    <template #footer>
      <div></div>
    </template>
  </Modal>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick } from 'vue'
import { IconClose } from '@arco-design/web-vue/es/icon'
import { Modal, Checkbox, Tooltip } from '@arco-design/web-vue'
import { clearAuthSession } from '@/lib/auth/session'
import { FeatchExit } from '@api/auth'
import { useRouter } from 'vue-router'
import mammoth from 'mammoth'

const isload = ref(false)
const router = useRouter()
const docxContent = ref('')
const checked = ref(true)

async function loadDocxFile() {
  try {
    const response = await fetch('https://c4ai.ccccltd.cn/xkprosdk/chaojizhinengtifuwuxueyi.docx')
    const arrayBuffer = await response.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer })
    isload.value = true
    nextTick(() => {
      docxContent.value = result.value
    })
  } catch (error) {
    console.error('Error loading DOCX file:', error)
  }
}

const changeCheck = async (a: boolean | (string | number | boolean)[]) => {
  if (!a) {
    await FeatchExit()
    clearAuthSession()
    router.push('/login')
  }
}

const emit = defineEmits<{
  closeModal: []
}>()

const handleCancel = () => {
  emit('closeModal')
}

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  isShow: {
    type: Boolean,
    default: false
  },
  iswidth: {
    type: Number,
    default: 0
  }
})

onMounted(() => {
  loadDocxFile()
})
</script>

<style lang="less" scoped>
:deep(table) {
  border-collapse: collapse;
}
:deep(td) {
  border: 1px solid black !important;
}
.model-title {
  position: relative;
  width: 100%;
  padding: 16px 0;
  color: #1d2129;
  font-weight: 600;
  font-size: 20px;
  line-height: 28px;
  text-align: center;
  .close-btn {
    position: absolute;
    top: 50%;
    right: 13px;
    color: #4e5969;
    transform: translateY(-50%);
    cursor: pointer;
  }
}
.leval-img {
  flex: 1;
  height: 559px;
  padding: 0 24px;
  overflow-y: scroll;
}
.is-padding {
  margin-bottom: 15px;
}
.bott-box {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  border-top: 1px solid rgb(236 236 236);
  span {
    margin-left: 4px;
  }
}
</style>
