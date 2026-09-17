<script setup lang="ts">
/**
 * 常驻应用 webview 宿主：不随路由卸载，用 CSS 位移做停靠/显示，
 * 避免每次切菜单都销毁并重建 guest。
 */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import { isAppRouteLocation } from '../../router/apps.meta'
import type { JiaorongAppOpenInfo } from '../types'

// 组件名固定，供 keep-alive 与调试面板识别
defineOptions({ name: 'JiaorongAppFrameHost' })

/** i18n 文案函数。 */
const { t } = useI18n()
/** 当前路由。 */
const route = useRoute()
/** 已创建的 webview 打开信息，一个应用一条。 */
const frames = ref<JiaorongAppOpenInfo[]>([])
/** appId → 真正写进 webview 的 src；延后一拍赋值，避免属性抖动导致重载。 */
const guestSrc = ref<Record<string, string>>({})
/** 当前错误文案。 */
const errorText = ref('')
/** 是否正在取打开信息。 */
const loading = ref(false)
/** 已挂过 `did-fail-load` 监听的 appId。 */
const attached = new Set<string>()
/** 路由离开应用页后仍要显示的 appId，保持 webview 不闪。 */
const parkedAppId = ref('')
/** 取消目录订阅。 */
let stopCatalogListener: (() => void) | undefined

/** 当前路由对应的应用 id；不在应用路由上则为空串。 */
const activeAppId = computed(() => {
  /** 路由参数里的 appId。 */
  const value = route.params?.appId
  // 不在应用路由上
  if (!isAppRouteLocation(route.name, route.path)) return ''
  // 只认字符串参数
  return typeof value === 'string' ? value.trim() : ''
})

/** 宿主是否激活，决定整块是否移出可视区。 */
const hostActive = computed(() => Boolean(activeAppId.value))
/** 当前该显示的 appId：优先路由，其次停靠的上一个。 */
const visibleAppId = computed(() => activeAppId.value || parkedAppId.value)
/** 只在应用路由上才展示错误，避免污染其它页面。 */
const activeError = computed(() => (activeAppId.value ? errorText.value : ''))

/**
 * 确保该应用有常驻 webview；没有就向主进程要打开信息。
 * @param appId 应用 id
 */
async function ensureFrame(appId: string) {
  // 空 id 不处理
  if (!appId) return
  // 已经建过：只清掉上一次的错误提示
  if (frames.value.some((item) => item.appId === appId)) {
    errorText.value = ''
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    /** 主进程返回的 webview 打开信息。 */
    const info = await window.jiaorongApps?.getOpenInfo(appId)
    // 拿不到 src：未安装、不可见或主进程未就绪
    if (!info?.src) {
      errorText.value = t('routes.embeddedAppUnavailable')
      return
    }
    // await 期间可能已被其它调用建好
    if (frames.value.some((item) => item.appId === appId)) return
    // 追加一条，触发下面的 watch 去写 src
    frames.value = [...frames.value, info]
  } catch (error) {
    // IPC 失败按「应用不可用」提示
    console.error('[jiaorong-app] Failed to open app', error)
    errorText.value = t('routes.embeddedAppUnavailable')
  } finally {
    loading.value = false
  }
}

/**
 * webview 加载失败回调。
 * @param appId 出错的帧
 * @param event `did-fail-load` 事件
 */
function onWebviewFail(appId: string, event: Event) {
  /** 带 Electron 错误字段的事件。 */
  const detail = event as Event & {
    /** Electron 错误码。 */
    errorCode?: number
    /** 错误描述。 */
    errorDescription?: string
    /** 是否主框架。 */
    isMainFrame?: boolean
  }
  // -3 是主动取消加载；子框架失败不影响页面
  if (detail.errorCode === -3 || detail.isMainFrame === false) return
  console.error('[jiaorong-app] webview failed', detail.errorDescription)
  // 只提示当前正在看的应用
  if (appId === activeAppId.value) {
    errorText.value = t('routes.embeddedAppUnavailable')
  }
}

/**
 * 丢弃某个 guest 帧的 src 记录，使其下次重新加载。
 * @param appId 应用 id
 */
function forgetGuestFrame(appId: string) {
  attached.delete(appId)
  // 本来就没有 src 记录
  if (!(appId in guestSrc.value)) return
  /** 去掉该 appId 后的新 src 表。 */
  const nextSrc = { ...guestSrc.value }
  delete nextSrc[appId]
  guestSrc.value = nextSrc
}

/** 给还没挂监听的帧补上 `did-fail-load`。 */
function bindFrameListeners() {
  for (const frame of frames.value) {
    // 已挂过
    if (attached.has(frame.appId)) continue
    /** webview DOM 元素。 */
    const el = document.getElementById(`jiaorong-app-frame-${frame.appId}`)
    // 还没渲染出来，等下一轮 watch 再试
    if (!el) continue
    attached.add(frame.appId)
    el.addEventListener('did-fail-load', (event) => onWebviewFail(frame.appId, event))
  }
}

/** 登录态变化后逐帧校验打开信息，变了就换新 src，不变则沿用避免白屏。 */
async function onAuthSessionChanged() {
  /** 保留下来的帧。 */
  const kept: JiaorongAppOpenInfo[] = []
  for (const frame of frames.value) {
    try {
      /** 最新的打开信息。 */
      const info = await window.jiaorongApps?.getOpenInfo(frame.appId)
      // 现在打不开了，丢弃该帧
      if (!info?.src) {
        forgetGuestFrame(frame.appId)
        continue
      }
      // src / partition / preload 都没变，沿用旧帧，避免重载白屏
      if (
        info.src === frame.src &&
        info.partition === frame.partition &&
        info.preload === frame.preload
      ) {
        kept.push(frame)
        continue
      }
      // 有变化：丢掉旧 src，换成新的
      forgetGuestFrame(frame.appId)
      kept.push(info)
    } catch {
      // 取信息失败，丢弃该帧
      forgetGuestFrame(frame.appId)
    }
  }
  frames.value = kept
  // 当前正在看的应用若被丢掉，重新建一次
  if (activeAppId.value) void ensureFrame(activeAppId.value)
}

// 路由切到某个应用：记住停靠 id 并确保帧存在
watch(activeAppId, (id) => {
  // 空 id（离开应用页）不动，保持 webview 常驻
  if (id) {
    parkedAppId.value = id
    void ensureFrame(id)
  }
})

// 帧列表变化后：等 DOM 渲染完再挂监听，并把 src 同步到 webview
watch(
  frames,
  async (list) => {
    await nextTick()
    bindFrameListeners()
    /** 新的 src 表。 */
    const next = { ...guestSrc.value }
    /** 仍存活的 appId。 */
    const ids = new Set(list.map((frame) => frame.appId))
    /** 是否需要写回。 */
    let changed = false
    for (const frame of list) {
      // src 没变就不动，避免 webview 重新加载
      if (next[frame.appId] === frame.src) continue
      next[frame.appId] = frame.src
      changed = true
    }
    // 清掉已经不存在的帧
    for (const appId of Object.keys(next)) {
      if (ids.has(appId)) continue
      delete next[appId]
      changed = true
    }
    // 没变化就不赋值，省掉一次重渲染
    if (changed) guestSrc.value = next
  },
  // 等 DOM 更新后再跑，保证能取到 webview 元素
  { flush: 'post' }
)

// 挂载：处理直接落在应用页的情况，并订阅登录态与目录变化
onMounted(() => {
  // 首次进入就在应用页
  if (activeAppId.value) {
    parkedAppId.value = activeAppId.value
    void ensureFrame(activeAppId.value)
  }
  window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  stopCatalogListener = window.jiaorongApps?.onCatalogChanged?.(() => {
    // 目录变化可能带来新装好的应用，重新确保一次
    if (activeAppId.value) void ensureFrame(activeAppId.value)
  })
})

// 卸载：退订，并通知主进程停掉所有应用子进程
onUnmounted(() => {
  stopCatalogListener?.()
  window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  for (const frame of frames.value) {
    void window.jiaorongApps?.leave?.(frame.appId)
  }
})
</script>

<template>
  <!-- 常驻宿主容器：不激活时整体移出可视区，webview 不被销毁 -->
  <div
    class="jiaorong-app-frame-host"
    :data-active="hostActive ? 'true' : 'false'"
    :aria-hidden="!hostActive"
  >
    <!-- 状态区：首次打开该应用时先转圈，失败则显示错误文案 -->
    <div
      v-if="hostActive && loading && !frames.some((item) => item.appId === activeAppId)"
      class="jiaorong-app-frame-host__status"
    >
      <div class="jiaorong-app-frame-host__loading">
        <Icon icon="lucide:loader-circle" class="size-4 animate-spin text-muted-foreground" />
        <span>{{ t('routes.embeddedAppLoading') }}</span>
      </div>
    </div>
    <p
      v-else-if="hostActive && activeError && !frames.some((item) => item.appId === activeAppId)"
      class="jiaorong-app-frame-host__status px-4 text-sm text-destructive"
    >
      {{ activeError }}
    </p>
    <!-- 每个已打开的应用一个常驻 webview，靠 is-active 决定谁在可视区 -->
    <webview
      v-for="frame in frames"
      :id="`jiaorong-app-frame-${frame.appId}`"
      :key="`${frame.appId}:${frame.partition}`"
      class="jiaorong-app-frame-host__frame"
      :class="{ 'is-active': frame.appId === visibleAppId }"
      :partition="frame.partition"
      :preload="frame.preload"
      v-bind="guestSrc[frame.appId] ? { src: guestSrc[frame.appId] } : {}"
      webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=no, webSecurity=yes, allowRunningInsecureContent=yes, devTools=yes"
    />
  </div>
</template>

<style scoped>
/* 宿主铺满父容器，盖在聊天页之上 */
.jiaorong-app-frame-host {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  width: 100%;
  height: 100%;
  /* 允许被父级压缩 */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--background);
}

/* 不激活：整体移出屏幕并断开交互，但仍保留 DOM 与 guest 进程 */
.jiaorong-app-frame-host[data-active='false'] {
  left: -100%;
  pointer-events: none;
  z-index: -1;
}

/* 加载/错误状态居中容器 */
.jiaorong-app-frame-host__status {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* 加载态：图标与文案横向排列 */
.jiaorong-app-frame-host__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
}

/* 单个 webview：默认停在屏幕外且不接收事件 */
.jiaorong-app-frame-host__frame {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  border: 0;
  pointer-events: none;
}

/* 当前应用：移回可视区并恢复交互 */
.jiaorong-app-frame-host__frame.is-active {
  left: 0;
  pointer-events: auto;
}
</style>
