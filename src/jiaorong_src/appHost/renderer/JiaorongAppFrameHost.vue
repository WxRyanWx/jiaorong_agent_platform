<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '@jiaorong/auth/host'
import { isAppRouteLocation } from '../../router/apps.meta'
import type { JiaorongAppOpenInfo } from '../types'

defineOptions({ name: 'JiaorongAppFrameHost' })

const { t } = useI18n()
const route = useRoute()
const frames = ref<JiaorongAppOpenInfo[]>([])
const errorText = ref('')
const loading = ref(false)
const attached = new Set<string>()
const parkedAppId = ref('')

const activeAppId = computed(() => {
  const value = route.params?.appId
  if (!isAppRouteLocation(route.name, route.path)) return ''
  return typeof value === 'string' ? value.trim() : ''
})

const hostActive = computed(() => Boolean(activeAppId.value))
const visibleAppId = computed(() => activeAppId.value || parkedAppId.value)
const activeError = computed(() => (activeAppId.value ? errorText.value : ''))

async function ensureFrame(appId: string) {
  if (!appId) return
  if (frames.value.some((item) => item.appId === appId)) {
    errorText.value = ''
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const info = await window.jiaorongApps?.getOpenInfo(appId)
    if (!info?.src) {
      errorText.value = t('routes.embeddedAppUnavailable')
      return
    }
    if (frames.value.some((item) => item.appId === appId)) return
    frames.value = [...frames.value, info]
  } catch (error) {
    console.error('[jiaorong-app] Failed to open app', error)
    errorText.value = t('routes.embeddedAppUnavailable')
  } finally {
    loading.value = false
  }
}

function onWebviewFail(appId: string, event: Event) {
  const detail = event as Event & {
    errorCode?: number
    errorDescription?: string
    isMainFrame?: boolean
  }
  if (detail.errorCode === -3 || detail.isMainFrame === false) return
  console.error('[jiaorong-app] webview failed', detail.errorDescription)
  if (appId === activeAppId.value) {
    errorText.value = t('routes.embeddedAppUnavailable')
  }
}

function bindFrameListeners() {
  for (const frame of frames.value) {
    if (attached.has(frame.appId)) continue
    const el = document.getElementById(`jiaorong-app-frame-${frame.appId}`)
    if (!el) continue
    attached.add(frame.appId)
    el.addEventListener('did-fail-load', (event) => onWebviewFail(frame.appId, event))
  }
}

async function onAuthSessionChanged() {
  const kept: JiaorongAppOpenInfo[] = []
  for (const frame of frames.value) {
    try {
      const info = await window.jiaorongApps?.getOpenInfo(frame.appId)
      if (!info?.src) {
        attached.delete(frame.appId)
        continue
      }
      if (
        info.src === frame.src &&
        info.partition === frame.partition &&
        info.preload === frame.preload
      ) {
        kept.push(frame)
        continue
      }
      attached.delete(frame.appId)
      kept.push(info)
    } catch {
      attached.delete(frame.appId)
    }
  }
  frames.value = kept
  if (activeAppId.value) void ensureFrame(activeAppId.value)
}

watch(activeAppId, (id) => {
  if (id) {
    parkedAppId.value = id
    void ensureFrame(id)
  }
})

watch(
  frames,
  async () => {
    await nextTick()
    bindFrameListeners()
  },
  { flush: 'post' }
)

onMounted(() => {
  if (activeAppId.value) {
    parkedAppId.value = activeAppId.value
    void ensureFrame(activeAppId.value)
  }
  window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
})

onUnmounted(() => {
  window.removeEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged)
  for (const frame of frames.value) {
    void window.jiaorongApps?.leave?.(frame.appId)
  }
})
</script>

<template>
  <div
    class="jiaorong-app-frame-host"
    :data-active="hostActive ? 'true' : 'false'"
    :aria-hidden="!hostActive"
  >
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
    <webview
      v-for="frame in frames"
      :id="`jiaorong-app-frame-${frame.appId}`"
      :key="frame.appId"
      class="jiaorong-app-frame-host__frame"
      :class="{ 'is-active': frame.appId === visibleAppId }"
      :src="frame.src"
      :preload="frame.preload"
      :partition="frame.partition"
      webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=no, webSecurity=yes, allowRunningInsecureContent=yes"
    />
  </div>
</template>

<style scoped>
.jiaorong-app-frame-host {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--background);
}

.jiaorong-app-frame-host[data-active='false'] {
  left: -100%;
  pointer-events: none;
  z-index: -1;
}

.jiaorong-app-frame-host__status {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.jiaorong-app-frame-host__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
}

.jiaorong-app-frame-host__frame {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  border: 0;
  pointer-events: none;
}

.jiaorong-app-frame-host__frame.is-active {
  left: 0;
  pointer-events: auto;
}
</style>
