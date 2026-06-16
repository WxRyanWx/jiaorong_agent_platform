<template>
  <div class="d">
    <Spin :loading="!isLoadingLogin" :size="32">
      <div :class="loginPageClass" :style="loginPageStyle">
        <div class="login-page__scale" :style="loginScaleStyle">
          <div v-show="isLoadingLogin" class="cont">
            <div class="main-cont">
              <div class="f-tit"></div>
              <Tabs :active-key="currentTab" @change="handleChange">
                <TabPane key="1" title="交建通扫码" eventname="交建通扫码" eventid="jjtScanCode">
                  <CodeLogin :is-check="checked"></CodeLogin>
                </TabPane>
                <TabPane key="2" title="账号登录" eventname="账号登录" eventid="accountLogin">
                  <Form
                    v-if="!captchaModal && !isRePassword"
                    ref="loginForm"
                    class="login-form"
                    :class="{ 'login-pp': isNotcheck }"
                    :model="userInfo"
                    layout="vertical"
                    @submit="handleSubmit"
                  >
                    <FormItem field="phoneNumber" :validate-trigger="['change', 'blur']" hide-label>
                      <Input
                        v-model="userInfo.phoneNumber"
                        disabled
                        placeholder="请输入手机号"
                        :maxlegth="11"
                        :input-attrs="{
                          eventname: '输入手机号',
                          eventid: 'inputPhoneNumber'
                        }"
                      >
                        <template #prefix>
                          <icon-mobile />
                        </template>
                      </Input>
                    </FormItem>
                    <FormItem
                      field="password"
                      :rules="[{ required: true, message: '密码不能为空' }]"
                      :validate-trigger="['change', 'blur']"
                      hide-label
                    >
                      <InputPassword
                        v-model="userInfo.password"
                        placeholder="请输入密码"
                        allow-clear
                        :input-attrs="{
                          eventname: '输入密码',
                          eventid: 'inputPassword'
                        }"
                      >
                        <template #prefix>
                          <icon-lock />
                        </template>
                      </InputPassword>
                    </FormItem>
                    <Space :size="isNotcheck ? 4 : 14" direction="vertical">
                      <div class="login-form-password-actions">
                        <Checkbox
                          v-if="false"
                          checked="rememberPassword"
                          :model-value="loginConfig.rememberPassword"
                          @change="setRememberPassword"
                        >
                          记住密码
                        </Checkbox>
                        <span
                          class="forget-pwd"
                          eventname="忘记密码"
                          eventid="forgetPassword"
                          @click="goBack(true, false, 0)"
                        >
                          忘记密码？
                        </span>
                      </div>
                      <div v-if="isNotcheck" class="nocheck-msg" style="height: 36px">
                        <div>请先阅读并同意《交融超级智能体用户服务协议》</div>
                      </div>
                      <Button
                        v-if="isNotcheck || !checked"
                        style="border-radius: 12px"
                        type="primary"
                        html-type="submit"
                        long
                        disabled
                        eventname="登录"
                        eventid="login"
                        :loading="loading"
                      >
                        登录
                      </Button>
                      <Button
                        v-if="!(isNotcheck || !checked)"
                        style="border-radius: 12px"
                        type="primary"
                        html-type="submit"
                        long
                        eventname="登录"
                        eventid="login"
                        :loading="loading"
                      >
                        登录
                      </Button>
                      <Button
                        style="border-radius: 12px"
                        type="text"
                        long
                        eventname="返回"
                        eventid="back"
                        @click="goBack(false, true, 0)"
                      >
                        返回
                      </Button>
                    </Space>
                  </Form>

                  <Form
                    v-if="captchaModal && !isRePassword"
                    ref="codeForm"
                    class="login-form"
                    :model="codeInfo"
                    layout="vertical"
                    :rules="forgetPsdRules"
                    @submit="handleSubmitCode"
                  >
                    <FormItem field="phoneNumber" :validate-trigger="['change', 'blur']" hide-label>
                      <Input
                        v-model="codeInfo.phoneNumber"
                        placeholder="请输入手机号"
                        :maxlegth="11"
                        :input-attrs="{
                          eventname: '输入手机号',
                          eventid: 'inputPhoneNumber'
                        }"
                      >
                        <template #prefix>
                          <icon-mobile />
                        </template>
                      </Input>
                    </FormItem>
                    <FormItem
                      field="captchaValue"
                      :validate-trigger="['change', 'blur']"
                      hide-label
                    >
                      <Input
                        v-model="codeInfo.captchaValue"
                        placeholder="请输入"
                        :maxlegth="6"
                        :input-attrs="{
                          eventname: '输入验证码',
                          eventid: 'inputVerificationCoder'
                        }"
                      >
                        <template #prefix> <icon-safe /> </template>
                        <template #suffix>
                          <div class="code-btn" style="width: 137px">
                            <Button
                              v-if="codeInfo.showGetCode"
                              type="text"
                              :disabled="isNotcheck"
                              eventname="发送验证码"
                              eventid="sendVerificationCode"
                              @click.stop="sendCode(0, codeInfo)"
                              >发送验证码</Button
                            >
                            <Button v-else :disabled="codeInfo.count >= 0" type="text"
                              >{{ codeInfo.count }}s后重新发送</Button
                            >
                          </div>
                        </template>
                      </Input>
                    </FormItem>
                    <div v-if="isNotcheck" class="nocheck-msg">
                      请先阅读并同意《交融超级智能体用户服务协议》
                    </div>
                    <Space :size="14" direction="vertical">
                      <div class="login-form-password-actions"></div>
                      <Button
                        style="border-radius: 12px"
                        type="primary"
                        html-type="submit"
                        long
                        :disabled="isNotcheck || !checked"
                        eventname="登录"
                        eventid="login"
                        :loading="loading"
                      >
                        登录
                      </Button>
                      <Button
                        style="border-radius: 12px"
                        type="text"
                        long
                        eventname="忘记密码"
                        eventid="forgetPassword"
                        @click="goBack(true, false, 2)"
                      >
                        忘记密码
                      </Button>
                    </Space>
                  </Form>
                  <Form
                    v-if="!captchaModal && isRePassword"
                    ref="codePwdForm"
                    class="login-form"
                    :model="codePwdInfo"
                    layout="vertical"
                    :rules="forgetPsdRules"
                    @submit="handleSubmitCodePwd"
                  >
                    <FormItem field="phoneNumber" :validate-trigger="['change', 'blur']" hide-label>
                      <Input
                        v-model="codePwdInfo.phoneNumber"
                        placeholder="请输入手机号"
                        :maxlegth="11"
                        :input-attrs="{
                          eventname: '输入手机号',
                          eventid: 'inputPhoneNumber'
                        }"
                      >
                        <template #prefix>
                          <icon-mobile />
                        </template>
                      </Input>
                    </FormItem>
                    <FormItem
                      field="captchaValue"
                      :validate-trigger="['change', 'blur']"
                      hide-label
                    >
                      <Input
                        ref="codeRef"
                        v-model="codePwdInfo.captchaValue"
                        validate-trigger="change"
                        autocomplete="off"
                        placeholder="请输入"
                        :maxlegth="6"
                        :input-attrs="{
                          eventname: '输入验证码',
                          eventid: 'inputVerificationCoder'
                        }"
                      >
                        <template #prefix> <icon-safe /> </template>
                        <template #suffix>
                          <div class="code-btn" style="width: 137px">
                            <Button
                              v-if="codePwdInfo.showGetCode"
                              type="text"
                              eventname="发送验证码"
                              eventid="sendVerificationCode"
                              @click="sendCode(1, codePwdInfo)"
                              >发送验证码</Button
                            >
                            <Button
                              v-else
                              :disabled="codePwdInfo.count >= 0"
                              type="text"
                              eventname="重新发送验证码"
                              eventid="resendVerificationCode"
                              >{{ codePwdInfo.count }}s后重新发送</Button
                            >
                          </div>
                        </template>
                      </Input>
                    </FormItem>
                    <FormItem field="password" :validate-trigger="['change', 'blur']" hide-label>
                      <InputPassword
                        v-model="codePwdInfo.password"
                        placeholder="请输入密码"
                        :input-attrs="{
                          eventname: '输入密码',
                          eventid: 'inputPassword'
                        }"
                      >
                        <template #prefix>
                          <icon-edit />
                        </template>
                      </InputPassword>
                    </FormItem>
                    <FormItem field="password2" :validate-trigger="['change', 'blur']" hide-label>
                      <InputPassword
                        v-model="codePwdInfo.password2"
                        placeholder="请再次输入密码"
                        allow-clear
                        :input-attrs="{
                          eventname: '输入密码',
                          eventid: 'inputPassword'
                        }"
                      >
                        <template #prefix>
                          <icon-lock />
                        </template>
                      </InputPassword>
                    </FormItem>
                    <Space direction="vertical">
                      <div class="login-form-password-actions"></div>
                      <Button
                        style="border-radius: 12px"
                        type="primary"
                        html-type="submit"
                        long
                        eventname="修改密码并登录"
                        eventid="changePasswordLogin"
                        :loading="loading"
                      >
                        修改密码并登录
                      </Button>
                      <Button
                        style="border-radius: 12px"
                        type="text"
                        long
                        eventname="返回"
                        eventid="back"
                        @click="goBack(currentRePassword, currentCaptchaModal, 3)"
                      >
                        返回
                      </Button>
                    </Space>
                  </Form>
                  <Form
                    v-if="captchaModal && isRePassword"
                    ref="rePsdForm"
                    class="login-form"
                    :class="{ rePsd: captchaModal && isRePassword }"
                    :model="rePsdInfo"
                    layout="vertical"
                    :rules="rePsdRules"
                    @submit="handleSubmitRePsd"
                  >
                    <FormItem field="phoneNumber" :validate-trigger="['change', 'blur']" hide-label>
                      <Input
                        v-model="rePsdInfo.phoneNumber"
                        disabled
                        placeholder="请输入手机号"
                        :maxlegth="11"
                        :input-attrs="{
                          eventname: '输入手机号',
                          eventid: 'inputPhoneNumber'
                        }"
                      >
                        <template #prefix>
                          <icon-mobile />
                        </template>
                      </Input>
                    </FormItem>
                    <div class="warn-msg">首次登录需要修改密码</div>
                    <FormItem
                      extra="8-50字符，必须包含大写字母、小写字母、数字、特殊符号(@$!%*?)"
                      field="password"
                      :validate-trigger="['change', 'blur']"
                      hide-label
                    >
                      <InputPassword
                        v-model="rePsdInfo.password"
                        placeholder="请输入密码"
                        :input-attrs="{
                          eventname: '输入密码',
                          eventid: 'inputPassword'
                        }"
                      >
                        <template #prefix>
                          <icon-edit />
                        </template>
                      </InputPassword>
                    </FormItem>
                    <FormItem field="password2" :validate-trigger="['change', 'blur']" hide-label>
                      <InputPassword
                        v-model="rePsdInfo.password2"
                        placeholder="请再次输入密码"
                        allow-clear
                        :input-attrs="{
                          eventname: '输入密码',
                          eventid: 'inputPassword'
                        }"
                      >
                        <template #prefix>
                          <icon-lock />
                        </template>
                      </InputPassword>
                    </FormItem>
                    <Space :size="14" direction="vertical">
                      <div class="login-form-password-actions"></div>
                      <Button
                        style="border-radius: 12px"
                        type="primary"
                        html-type="submit"
                        long
                        eventname="登录"
                        eventid="login"
                        :loading="loading"
                      >
                        登录
                      </Button>
                      <Button
                        style="border-radius: 12px"
                        type="text"
                        long
                        eventname="返回"
                        eventid="back"
                        @click="goBack(false, true, 1)"
                      >
                        返回
                      </Button>
                    </Space>
                  </Form>
                </TabPane>
              </Tabs>
              <div
                v-if="(captchaModal && !isRePassword) || (!captchaModal && !isRePassword)"
                class="bott-box"
              >
                <Checkbox v-model="checked" style="margin-right: 4px" @change="changeCheck">
                </Checkbox>
                我已阅读并同意<span @click="visib = true">《交融超级智能体用户服务协议》</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Spin>
    <UserCompact :is-show="false" :visible="visib" @close-modal="visib = false"></UserCompact>
  </div>
</template>

<script lang="ts" setup>
import {
  Button,
  Form,
  Input,
  FormItem,
  Tabs,
  TabPane,
  InputPassword,
  Space,
  Checkbox,
  Message,
  Spin
} from '@arco-design/web-vue'
import { IconLock, IconMobile, IconSafe, IconEdit } from '@arco-design/web-vue/es/icon'
import CodeLogin from '@/components/login/CodeLogin.vue'
import UserCompact from '@/components/login/UserCompact.vue'
import { nextTick, onMounted, reactive, ref } from 'vue'
import {
  FeatchLogin,
  sendCaptcha,
  checkCode,
  FeatchUserInfo,
  FeatchUpdatePwd,
  FeatchRetrievePwd,
  FeatchUsageRecord
} from '@api/auth'
import { useRouter } from 'vue-router'
import type { FormInstance } from '@arco-design/web-vue/es/form'
import type { ValidatedError } from '@arco-design/web-vue/es/form/interface'
import beforeLoginAuto from '@/lib/auth/bootstrap-before'
import { markAuthSessionValidated } from '@/lib/auth/session'
import { useLoginPageScale } from '@/composables/useLoginPageScale'

const { loginScaleStyle, loginPageStyle, loginPageClass } = useLoginPageScale()

const visib = ref(false)
const isLoadingLogin = ref(false)
const codeRef = ref(null)
const router = useRouter()
const resName = ref('')
const oldPsd = ref('')
const isTrue = ref(false)
const captchaModal = ref(true)
const isRePassword = ref(false)
const currentCaptchaModal = ref(false)
const currentRePassword = ref(false)
const loading = ref(false)
const loginForm = ref<FormInstance>()
const codeForm = ref<FormInstance>()
const codePwdForm = ref<FormInstance>()
const rePsdForm = ref<FormInstance>()
const checked = ref(false)
const currentTab = ref('1')
const isNotcheck = ref(false)

const handleChange = (a: string) => {
  currentTab.value = a
  captchaModal.value = true
  isRePassword.value = false
}

const changeCheck = async (a: boolean | (string | number | boolean)[]) => {
  isNotcheck.value = !a
  checked.value = a as boolean
}

const loginConfig = reactive({
  rememberPassword: true,
  username: '',
  password: '',
  phoneNumber: null as string | null
})

const userInfo = reactive({
  username: loginConfig.username,
  password: loginConfig.password,
  phoneNumber: loginConfig.phoneNumber
})

const rePsdInfo = reactive({
  phoneNumber: null as string | null,
  key: '',
  password: '',
  password2: ''
})

const codeInfo = reactive({
  phoneNumber: null as string | null,
  captchaKey: '',
  captchaValue: '',
  showGetCode: true,
  timer: null as ReturnType<typeof setInterval> | null,
  count: 60
})

const codePwdInfo = reactive({
  phoneNumber: null as string | null,
  captchaKey: '',
  password: '',
  password2: '',
  captchaValue: '',
  showGetCode: true,
  timer: null as ReturnType<typeof setInterval> | null,
  count: 60
})

const forgetPsdRules = reactive({
  captchaValue: [{ required: true, message: '验证码不能为空' }],
  phoneNumber: [
    { required: true, message: '手机号为必填项' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        const reg = /^1[3-9]\d{9}$/
        if (!reg.test(value)) {
          isTrue.value = false
          cb('手机号格式不正确')
        } else {
          isTrue.value = true
          cb()
        }
      }
    }
  ],
  password: [
    { required: true, min: 8, message: '密码不能为空' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        const reg = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?])[A-Za-z\d@$!%*?]{8,50}$/
        if (value === userInfo.password) {
          cb('重置密码不能和上次密码一样')
        } else if (!reg.test(value)) {
          cb('8-50字符，必须包含大写字母、小写字母、数字、特殊符号(@$!%*?)')
        } else {
          cb()
        }
      }
    }
  ],
  password2: [
    { required: true, message: '密码不能为空' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        if (value !== codePwdInfo.password) {
          cb('密码两次输入不一致，请重新输入！')
        } else {
          cb()
        }
      }
    }
  ]
})

const rePsdRules = reactive({
  password: [
    { required: true, min: 8, message: '密码不能为空' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        const reg = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?])[A-Za-z\d@$!%*?]{8,50}$/
        if (value === userInfo.password) {
          cb('重置密码不能和上次密码一样')
        } else if (!reg.test(value)) {
          cb('密码格式不正确')
        } else {
          cb()
        }
      }
    }
  ],
  password2: [
    { required: true, message: '密码不能为空' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        if (value !== rePsdInfo.password) {
          cb('密码两次输入不一致，请重新输入！')
        } else {
          cb()
        }
      }
    }
  ]
})

type CodeFormState = {
  phoneNumber: string | null
  captchaKey: string
  captchaValue: string
  showGetCode: boolean
  timer: ReturnType<typeof setInterval> | null
  count: number
}

const clearInter = (obj: CodeFormState, index: number) => {
  if (index) {
    obj.phoneNumber = null
  }
  if (obj.timer) {
    clearInterval(obj.timer)
  }
  obj.timer = null
  obj.captchaValue = ''
  obj.showGetCode = true
}

const sendCode = async (index: number, obj: CodeFormState) => {
  if (!index && !checked.value) {
    isNotcheck.value = true
    return
  }
  if (obj.phoneNumber && isTrue.value) {
    obj.captchaValue = ''
    const res = await sendCaptcha(obj.phoneNumber)
    if (res.code === 8000000) {
      Message.success('验证码发送成功！')
      obj.captchaKey = res.data
      const TIME_COUNT = 60
      if (!obj.timer) {
        obj.showGetCode = false
        obj.count = TIME_COUNT
        obj.timer = setInterval(() => {
          if (obj.count > 0 && obj.count <= TIME_COUNT) {
            obj.count -= 1
          } else {
            obj.showGetCode = true
            if (obj.timer) {
              clearInterval(obj.timer)
            }
            obj.timer = null
          }
        }, 1000)
      }
    } else if (res.code !== 8000000 && index === 1) {
      clearInter(codePwdInfo, 1)
    }
  } else {
    Message.error('手机号不能为空或格式不正确')
  }
}

const checkCaptcha = async (num: string, key: string, val: string) => {
  loading.value = true
  try {
    const res = await checkCode(num, key, val)
    if (res.code === 8000000) {
      clearInter(codeInfo, 1)
      loading.value = false
      rePsdInfo.phoneNumber = res.data.phone
      rePsdInfo.key = res.data.key
      userInfo.phoneNumber = res.data.phone
      if (!res.data.isInitPwd) {
        captchaModal.value = true
        isRePassword.value = true
      } else {
        captchaModal.value = false
        isRePassword.value = false
      }
    }
  } finally {
    loading.value = false
  }
}

async function handLogin(values: Record<string, string>): Promise<void> {
  loading.value = true
  try {
    const loginRes = await FeatchLogin(values.phoneNumber, values.password)
    if (loginRes.code === 8000000) {
      Message.success('登录成功')
      localStorage.setItem('xkaitoken', loginRes.access_token)
      resName.value = loginRes.userName

      if (localStorage.getItem('xkaitoken') && resName.value) {
        const res1 = await FeatchUserInfo(resName.value)
        localStorage.setItem('userFullInfo', JSON.stringify(res1.data))
        localStorage.setItem('userInfo', JSON.stringify(res1.data))
        resName.value = res1.data.userName
        await FeatchUsageRecord({}, 'login', res1.data.id)
        markAuthSessionValidated()
      }
      router.push('/chat')
    }
  } catch (err) {
    console.log('err', err)
  } finally {
    loading.value = false
  }
}

const goBack = (boolon1: boolean, boolon2: boolean, num: number) => {
  if ((num === 2 && !checked.value) || (boolon1 && !boolon2 && !num && !checked.value)) {
    isNotcheck.value = true
    codeForm.value?.clearValidate()
    return
  }
  currentCaptchaModal.value = captchaModal.value
  currentRePassword.value = isRePassword.value
  isRePassword.value = boolon1
  captchaModal.value = boolon2
  if (num === 1) {
    rePsdForm.value?.resetFields()
  } else if (num === 2) {
    codeForm.value?.resetFields()
    clearInter(codeInfo, 1)
    codePwdInfo.captchaValue = ''
    nextTick(() => {
      codePwdInfo.captchaValue = ''
    })
  } else if (num === 3) {
    codePwdForm.value?.resetFields()
    clearInter(codePwdInfo, 1)
  } else {
    loginForm.value?.resetFields()
  }
}

const handleSubmitRePsd = async ({
  errors,
  values
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, string>
}) => {
  if (!errors) {
    loading.value = true
    try {
      const res = await FeatchUpdatePwd(values.password2, rePsdInfo.key)
      loading.value = false
      if (res.code === 8000000) {
        const params = {
          phoneNumber: values.phoneNumber,
          password: values.password2
        }
        await handLogin(params)
        rePsdForm.value?.resetFields()
      }
      codeInfo.captchaValue = ''
    } catch {
      loading.value = false
    }
  }
}

const handleSubmit = async ({
  errors,
  values
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, string>
}) => {
  oldPsd.value = `${values.password}`
  if (!errors) {
    await handLogin(values)
  }
}

const handleSubmitCode = async ({
  errors,
  values
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, string> & CodeFormState
}) => {
  if (!errors) {
    checkCaptcha(values.phoneNumber!, values.captchaKey, values.captchaValue)
  }
}

const handleSubmitCodePwd = async ({
  errors,
  values
}: {
  errors: Record<string, ValidatedError> | undefined
  values: Record<string, string> & CodeFormState
}) => {
  if (!errors) {
    const res = await FeatchRetrievePwd(
      values.captchaValue,
      values.captchaKey,
      values.phoneNumber!,
      values.password2
    )
    if (res.code === 8000000) {
      const params = {
        phoneNumber: values.phoneNumber!,
        password: values.password2
      }
      await handLogin(params)
      clearInter(codePwdInfo, 0)
      codePwdForm.value?.resetFields()
    } else {
      clearInter(codePwdInfo, 0)
    }
  }
}

const setRememberPassword = (value: boolean | (string | number | boolean)[]) => {
  loginConfig.rememberPassword = value as boolean
}

onMounted(async () => {
  await beforeLoginAuto(router, isLoadingLogin)
})
</script>

<style lang="less" scoped>
@import url('./login/index.less');
</style>
