<template>
  <SettingsPageShell
    :title="t('routes.settings-common')"
    :eyebrow="t('settings.controlCenter.groups.setup')"
    data-testid="settings-general-page"
    class="settings-general-page"
  >
    <div class="flex w-full flex-col gap-3">
      <UploadFileSettingsSection />
      <ProxySettingsSection />
      <CommandShellSettingsSection />
      <DcToggleRow
        id="launch-at-login-switch"
        icon="lucide:power"
        :label="t('settings.common.launchAtLoginEnabled')"
        label-min-width="220px"
        :model-value="launchAtLoginEnabled"
        @update:model-value="handleLaunchAtLoginChange"
      />
      <DcToggleRow
        id="auto-scroll-switch"
        icon="lucide:arrow-down"
        :label="t('settings.common.autoScrollEnabled')"
        label-min-width="220px"
        :model-value="autoScrollEnabled"
        @update:model-value="handleAutoScrollChange"
      />
      <DcToggleRow
        id="copy-with-cot-switch"
        icon="lucide:file-text"
        :label="t('settings.common.copyWithCotEnabled')"
        label-min-width="220px"
        :model-value="copyWithCotEnabled"
        @update:model-value="handleCopyWithCotChange"
      />
      <DcToggleRow
        id="trace-debug-switch"
        icon="lucide:bug"
        :label="t('settings.common.traceDebugEnabled')"
        :description="t('settings.common.traceDebugEnabledDesc')"
        label-min-width="220px"
        :model-value="traceDebugEnabled"
        @update:model-value="handleTraceDebugChange"
      />
      <LoggingSettingsSection />
      <section class="flex h-10 items-center gap-3">
        <div class="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]">
          <Icon icon="lucide:log-out" class="w-4 h-4 text-muted-foreground" />
          <span class="truncate">{{ t('settings.common.signOut') }}</span>
        </div>
        <DcButton
          variant="outline"
          class="ml-auto"
          :disabled="isSigningOut"
          :loading="isSigningOut"
          data-testid="settings-sign-out-button"
          @click="handleSignOut"
        >
          {{ t('settings.common.signOut') }}
        </DcButton>
      </section>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { DcButton } from '@dc-ui/components/button'
import { createWindowClient } from '@api/WindowClient'
import { FeatchExit } from '@jiaorong/api/auth'
import { clearAuthSession } from '@jiaorong/auth/host'
import { useUiSettingsStore } from '@/stores/uiSettingsStore'
import { DcToggleRow } from '@dc-ui/components/toggle-row'
import ProxySettingsSection from './common/ProxySettingsSection.vue'
import CommandShellSettingsSection from './common/CommandShellSettingsSection.vue'
import LoggingSettingsSection from './common/LoggingSettingsSection.vue'
import UploadFileSettingsSection from './common/UploadFileSettingsSection.vue'
import SettingsPageShell from './control-center/SettingsPageShell.vue'

const { t } = useI18n()
const windowClient = createWindowClient()
const uiSettingsStore = useUiSettingsStore()
const isSigningOut = shallowRef(false)

const autoScrollEnabled = computed(() => uiSettingsStore.autoScrollEnabled)
const copyWithCotEnabled = computed(() => uiSettingsStore.copyWithCotEnabled)
const traceDebugEnabled = computed(() => uiSettingsStore.traceDebugEnabled)
const launchAtLoginEnabled = computed(() => uiSettingsStore.launchAtLoginEnabled)

const handleAutoScrollChange = (value: boolean) => {
  uiSettingsStore.setAutoScrollEnabled(value)
}

const handleLaunchAtLoginChange = (value: boolean) => {
  uiSettingsStore.setLaunchAtLoginEnabled(value)
}

const handleCopyWithCotChange = (value: boolean) => {
  uiSettingsStore.setCopyWithCotEnabled(value)
}

const handleTraceDebugChange = (value: boolean) => {
  uiSettingsStore.setTraceDebugEnabled(value)
}

const handleSignOut = async (): Promise<void> => {
  if (isSigningOut.value) return
  isSigningOut.value = true
  try {
    await FeatchExit()
    await clearAuthSession()
    await windowClient.requestAuthLogout()
  } finally {
    isSigningOut.value = false
  }
}
</script>
