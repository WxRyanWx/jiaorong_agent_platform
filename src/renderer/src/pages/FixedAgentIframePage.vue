<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <iframe
      v-if="iframeUrl"
      :key="iframeRenderKey"
      :src="iframeUrl"
      :title="pageTitle"
      :style="iframeStyle"
      class="h-full w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  getFixedIframeAgent,
  isFixedIframeAgentId,
  resolveFixedIframeStyle,
} from "@shared/fixedIframeAgents";
import { useAgentStore } from "@/stores/ui/agent";
import { forceRevalidateAuthSession } from "@/lib/auth/session";

/** 固定 iframe 页停留时的登录态检测间隔 */
const AUTH_POLL_INTERVAL_MS = 30 * 60 * 1000;

const props = defineProps<{
  agentId: string;
}>();

const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();

const agentDefinition = computed(() => getFixedIframeAgent(props.agentId));
const iframeUrl = computed(() => {
  if (!isFixedIframeAgentId(props.agentId)) {
    return "";
  }

  return agentStore.resolveFixedIframeUrl(props.agentId);
});
const iframeStyle = computed(() => {
  if (!isFixedIframeAgentId(props.agentId)) {
    return undefined;
  }

  return resolveFixedIframeStyle(
    props.agentId,
    agentStore.getFixedIframeSecondaryNavId(props.agentId),
  );
});
const iframeRenderKey = computed(() => {
  if (!isFixedIframeAgentId(props.agentId)) {
    return "";
  }

  return `${iframeUrl.value}::${agentStore.getFixedIframeReloadNonce(props.agentId)}`;
});
const pageTitle = computed(() =>
  agentDefinition.value ? t(agentDefinition.value.nameKey) : props.agentId,
);

let authPollTimer: ReturnType<typeof setInterval> | null = null
let authPollDisposed = false

const pollAuthSession = async () => {
  const valid = await forceRevalidateAuthSession()
  if (authPollDisposed) {
    return
  }
  if (!valid) {
    // 401 时拦截器通常已跳转；无 token 时此处兜底
    void router.push({ name: 'login' })
  }
}

onMounted(() => {
  authPollDisposed = false
  authPollTimer = setInterval(() => {
    void pollAuthSession()
  }, AUTH_POLL_INTERVAL_MS)
})

onUnmounted(() => {
  authPollDisposed = true
  if (authPollTimer) {
    clearInterval(authPollTimer)
    authPollTimer = null
  }
})
</script>
