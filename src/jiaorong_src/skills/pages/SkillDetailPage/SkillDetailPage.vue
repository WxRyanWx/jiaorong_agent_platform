<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Switch } from '@shadcn/components/ui/switch'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import { useToast } from '@/components/use-toast'
import { getSkillDetail, type SkillDetailResponse } from '@jiaorong/api/skills'
import {
  disableSkill,
  enableSkill,
  getSkillSwitchStatus,
  installSkillFromZipUrl,
  isMissingSkillManifestError,
  isSkillInstalled,
  isSkillInstalledAsync,
  openSkillFolder,
  readSkillMarkdown,
  showGlobalSuccessToast,
  SkillSwitchStatus,
  startGeneralChatWithSkills,
  uninstallSkill as uninstallRealSkill
} from '@jiaorong/utils'
import {
  forgetSkillInstallRecords,
  isProtectedSystemSkill,
  readJiaorongSkillFromSession,
  rememberRemoteInstall,
  rememberSkillSource,
  saveJiaorongSkillToSession,
  SkillSource,
  type JiaorongSkillItem
} from '../../lib/sessionSkill'
import {
  formatSkillInstallError,
  formatSkillUninstallError
} from '../../lib/formatSkillInstallError'
import { parseSkillMarketTab } from '../../lib/skillMarketTab'
import { resolveSkillTryPrompts } from '../../lib/resolveSkillTryPrompts'
import skillIcon from '@jiaorong/assets/skill.png'
import codeIcon from '@jiaorong/brand/icons/skill-detail/code@2x.png'
import codeActiveIcon from '@jiaorong/brand/icons/skill-detail/code-active@2x.png'
import previewIcon from '@jiaorong/brand/icons/skill-detail/preview@2x.png'
import previewActiveIcon from '@jiaorong/brand/icons/skill-detail/preview-active@2x.png'
import './index.less'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { toast } = useToast()
const uninstalling = ref(false)
const installing = ref(false)
const uninstallConfirmOpen = ref(false)
const skillMarkdown = ref('')
const skillMarkdownLoading = ref(false)
const skillMarkdownError = ref('')
const skill = ref<JiaorongSkillItem | null>(readJiaorongSkillFromSession())
const remoteSkillDetail = ref<SkillDetailResponse | null>(null)
const installed = ref(false)
const enabled = ref(true)
const sourceViewMode = ref<'source' | 'preview'>('source')

const skillId = computed(() => String(route.params.skillId ?? ''))
const currentSkillName = computed(() => skill.value?.name || skillId.value)
const skillDisplayName = computed(() => {
  if (remoteSkillDetail.value?.name.trim()) {
    return remoteSkillDetail.value.name.trim()
  }
  const displayName = skill.value?.metadata?.displayName
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : skill.value?.name || ''
})
const skillDescription = computed(
  () => remoteSkillDetail.value?.description || skill.value?.description || ''
)
const skillTryPrompts = computed(() =>
  resolveSkillTryPrompts({
    skillMarkdown: skillMarkdown.value,
    skillMetadata: skill.value?.metadata,
    remoteTryPrompts: remoteSkillDetail.value?.tryPrompts
  })
)

/** 内置 14 + 默认市场 19：详情页不展示删除 */
const canDeleteSkill = computed(() => {
  if (!installed.value) return false
  return !isProtectedSystemSkill({
    skillName: currentSkillName.value,
    displayName: skillDisplayName.value,
    skillSource: skill.value?.skill_source
  })
})

/** session 中远程市场技能（skill_source=2）的 remoteId，用于详情接口 */
function resolveSessionRemoteId(
  routeSkillId: string,
  stored: JiaorongSkillItem | null
): string | null {
  if (!stored) return null

  const installedName = stored.metadata?.installedSkillName
  const displayName = stored.metadata?.displayName
  const matchesRoute =
    !routeSkillId ||
    stored.name === routeSkillId ||
    (typeof installedName === 'string' && installedName === routeSkillId) ||
    (typeof displayName === 'string' && displayName === routeSkillId)
  if (!matchesRoute) return null

  const remoteId = stored.metadata?.remoteId
  if (typeof remoteId !== 'string' || !remoteId.trim()) return null
  // 仅远程市场技能（source=2）走详情接口；缺省 source 时以 remoteId 为准
  if (stored.skill_source != null && stored.skill_source !== SkillSource.RemoteApi) {
    return null
  }
  return remoteId.trim()
}

watch(
  skillId,
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    remoteSkillDetail.value = null
    const stored = readJiaorongSkillFromSession()
    const remoteId = resolveSessionRemoteId(currentSkillId.trim(), stored)
    if (!remoteId) return

    try {
      const detail = await getSkillDetail(remoteId)
      if (cancelled || !detail) return
      remoteSkillDetail.value = detail
      // 把详情里的下载地址写回 session，避免列表合并丢字段后无法再装
      const current = skill.value ?? stored
      if (!current) return
      const nextMeta = {
        ...current.metadata,
        remoteId: detail.id || remoteId,
        ...(detail.downloadUrl ? { downloadUrl: detail.downloadUrl } : {}),
        displayName:
          detail.name ||
          (typeof current.metadata?.displayName === 'string' && current.metadata.displayName) ||
          current.name
      }
      const nextSkill: JiaorongSkillItem = {
        ...current,
        // 接口 desc 优先，没有再用本地文档 description
        description: detail.description || current.description,
        skill_source: SkillSource.RemoteApi,
        metadata: nextMeta
      }
      skill.value = nextSkill
      saveJiaorongSkillToSession(nextSkill)
    } catch (error) {
      console.error(`[SkillDetailPage] Failed to load remote skill detail for ${remoteId}:`, error)
    }
  },
  { immediate: true }
)

watch(
  skillId,
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    const storedSkill = readJiaorongSkillFromSession()
    const routeId = currentSkillId.trim()
    const installedName = storedSkill?.metadata?.installedSkillName
    const storedDisplayName = storedSkill?.metadata?.displayName
    const matchesStored =
      Boolean(storedSkill) &&
      (!routeId ||
        storedSkill!.name === routeId ||
        (typeof installedName === 'string' && installedName === routeId) ||
        (typeof storedDisplayName === 'string' && storedDisplayName === routeId))
    skill.value = matchesStored ? storedSkill : routeId ? null : storedSkill
    const name = skill.value?.name || currentSkillId
    const localName =
      typeof skill.value?.metadata?.installedSkillName === 'string'
        ? skill.value.metadata.installedSkillName.trim()
        : ''
    const metaDisplayName =
      typeof skill.value?.metadata?.displayName === 'string'
        ? skill.value.metadata.displayName.trim()
        : ''
    installed.value = isSkillInstalled(name, localName, metaDisplayName, routeId)
    enabled.value = getSkillSwitchStatus(localName || name) === SkillSwitchStatus.On
    const foundOnDisk = await isSkillInstalledAsync(name, localName, metaDisplayName, routeId)
    if (!cancelled) installed.value = foundOnDisk
  },
  { immediate: true }
)

watch(
  [skillId, installed],
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    skillMarkdown.value = ''
    skillMarkdownError.value = ''
    const [id, isInstalled] = currentSkillId
    if (!id || !isInstalled) return

    skillMarkdownLoading.value = true
    try {
      const stored = skill.value ?? readJiaorongSkillFromSession()
      const installedName = stored?.metadata?.installedSkillName
      const readName = (typeof installedName === 'string' && installedName.trim()) || String(id)
      const content = await readSkillMarkdown(readName)
      if (!cancelled) skillMarkdown.value = content
    } catch (error) {
      if (cancelled) return
      if (isMissingSkillManifestError(error)) {
        const stayedOnRemote = await revertDetailToUninstalled()
        if (!cancelled && !stayedOnRemote) {
          await router.push(skillsListLocation())
        }
        return
      }
      skillMarkdownError.value =
        error instanceof Error ? error.message : t('routes.skillsUnknownError')
    } finally {
      if (!cancelled) skillMarkdownLoading.value = false
    }
  },
  { immediate: true }
)

function skillsListLocation() {
  return {
    name: 'skills' as const,
    query: { tab: parseSkillMarketTab(route.query.tab) }
  }
}

const goBack = () => {
  void router.push(skillsListLocation())
}

const updateEnabled = async (nextEnabled: boolean) => {
  const result = nextEnabled
    ? await enableSkill(currentSkillName.value)
    : await disableSkill(currentSkillName.value)

  enabled.value = result.status === SkillSwitchStatus.On
  if (!result.success) {
    toast({
      title: t('routes.skillsUnknownError'),
      description: result.error || t('routes.skillsUnknownError'),
      variant: 'destructive'
    })
  }
}

const useSkill = async (prompt = '') => {
  const name = currentSkillName.value
  if (!name) return
  await startGeneralChatWithSkills({
    router,
    prompt,
    skillNames: [name]
  })
}

function getSessionDownloadUrl(stored: JiaorongSkillItem | null): string {
  const fromSession = stored?.metadata?.downloadUrl
  if (typeof fromSession === 'string' && fromSession.trim()) {
    return fromSession.trim()
  }
  const fromDetail = remoteSkillDetail.value?.downloadUrl
  return typeof fromDetail === 'string' ? fromDetail.trim() : ''
}

/** 与列表页 handleInstall 一致：zip URL 安装后打标并回写 session */
const handleInstall = async () => {
  if (installing.value || installed.value) return

  const stored = skill.value ?? readJiaorongSkillFromSession()
  const downloadUrl = getSessionDownloadUrl(stored)
  if (!downloadUrl) {
    toast({
      title: '安装失败',
      description: '缺少下载地址',
      variant: 'destructive'
    })
    return
  }

  installing.value = true
  try {
    const result = await installSkillFromZipUrl(downloadUrl, {
      displayName:
        remoteSkillDetail.value?.name.trim() ||
        (typeof stored?.metadata?.displayName === 'string' && stored.metadata.displayName.trim()) ||
        skillDisplayName.value ||
        undefined
    })
    if (!result.success || !result.skillName) {
      toast({
        title: '安装失败',
        description: formatSkillInstallError(result.error || '未知错误', 'remote'),
        variant: 'destructive'
      })
      return
    }

    const marketName = stored?.name || skillId.value || result.skillName
    rememberSkillSource(result.skillName, SkillSource.RemoteApi)
    rememberRemoteInstall(marketName, result.skillName)

    const nextSkill: JiaorongSkillItem = {
      ...(stored ?? {
        name: result.skillName,
        description: skillDescription.value,
        path: '',
        skillRoot: result.skillName,
        category: null,
        metadata: {}
      }),
      name: result.skillName,
      skillRoot: result.skillName,
      skill_source: SkillSource.RemoteApi,
      metadata: {
        ...stored?.metadata,
        displayName:
          (typeof stored?.metadata?.displayName === 'string' && stored.metadata.displayName) ||
          marketName,
        installedSkillName: result.skillName
      }
    }
    saveJiaorongSkillToSession(nextSkill)
    skill.value = nextSkill
    installed.value = true
    enabled.value = getSkillSwitchStatus(result.skillName) === SkillSwitchStatus.On

    if (skillId.value !== result.skillName) {
      await router.replace({
        name: 'skills-detail',
        params: { skillId: result.skillName },
        query: route.query
      })
    }
  } finally {
    installing.value = false
  }
}

const handleOpenSkillFolder = async () => {
  if (!skill.value) return

  try {
    await openSkillFolder(skill.value.name)
  } catch (error) {
    toast({
      title: t('routes.skillsOpenFolderFailed'),
      description: error instanceof Error ? error.message : t('routes.skillsUnknownError'),
      variant: 'destructive'
    })
  }
}

const openUninstallConfirm = () => {
  if (!canDeleteSkill.value || !currentSkillName.value || uninstalling.value) return
  uninstallConfirmOpen.value = true
}

const closeUninstallConfirm = () => {
  if (uninstalling.value) return
  uninstallConfirmOpen.value = false
}

const uninstallSkill = async () => {
  const name = currentSkillName.value
  if (!name || uninstalling.value || !canDeleteSkill.value) return

  uninstallConfirmOpen.value = false
  uninstalling.value = true
  const result = await uninstallRealSkill(name)
  if (!result.success) {
    uninstalling.value = false
    toast({
      title: t('routes.skillsUninstallFailed'),
      description: formatSkillUninstallError(result.error || t('routes.skillsUnknownError')),
      variant: 'destructive'
    })
    return
  }
  uninstalling.value = false
  showGlobalSuccessToast(t('routes.skillsUninstallSuccess'))
  const stayedOnRemote = await revertDetailToUninstalled()
  if (!stayedOnRemote) {
    await router.push(skillsListLocation())
  }
}

async function revertDetailToUninstalled(): Promise<boolean> {
  installed.value = false
  skillMarkdown.value = ''
  skillMarkdownError.value = ''

  const stored = skill.value ?? readJiaorongSkillFromSession()
  if (stored) {
    forgetSkillInstallRecords(stored.name)
    const installedName = stored.metadata?.installedSkillName
    if (typeof installedName === 'string' && installedName.trim()) {
      forgetSkillInstallRecords(installedName)
    }
  }
  forgetSkillInstallRecords(currentSkillName.value)
  forgetSkillInstallRecords(skillId.value)

  // 卸载 / 手删后保留远程字段，清本地安装态，便于同页再装
  if (stored?.skill_source === SkillSource.RemoteApi || stored?.metadata?.remoteId) {
    const displayName =
      (typeof stored.metadata?.displayName === 'string' && stored.metadata.displayName.trim()) ||
      remoteSkillDetail.value?.name ||
      stored.name
    const { installedSkillName: _removed, ...restMeta } = (stored.metadata ?? {}) as Record<
      string,
      unknown
    > & { installedSkillName?: unknown }
    const nextSkill: JiaorongSkillItem = {
      ...stored,
      name: displayName,
      path: '',
      skillRoot: '',
      skill_source: SkillSource.RemoteApi,
      metadata: {
        ...restMeta,
        displayName,
        remoteId: restMeta.remoteId ?? remoteSkillDetail.value?.id,
        downloadUrl:
          (typeof restMeta.downloadUrl === 'string' && restMeta.downloadUrl) ||
          remoteSkillDetail.value?.downloadUrl ||
          undefined
      }
    }
    skill.value = nextSkill
    saveJiaorongSkillToSession(nextSkill)
    if (skillId.value !== displayName) {
      await router.replace({
        name: 'skills-detail',
        params: { skillId: displayName },
        query: route.query
      })
    }
    return true
  }

  if (stored) {
    skill.value = {
      ...stored,
      path: '',
      skillRoot: ''
    }
  }
  return false
}
</script>

<template>
  <div class="skill-detail-page">
    <div class="skill-detail-page-scroll">
      <div class="skill-detail-nav">
        <Button variant="ghost" class="skill-detail-back" @click="goBack">
          <Icon icon="lucide:arrow-left" class="skill-detail-back-icon" />
          {{ t('routes.skillsBack') }}
        </Button>
        <span class="skill-detail-breadcrumb">
          {{ t('routes.skillsMarket') }}
          <span class="skill-detail-breadcrumb-sep"> / </span>
          <span class="skill-detail-breadcrumb-name">{{
            skillDisplayName || t('routes.skillsDetail')
          }}</span>
        </span>
      </div>

      <section class="skill-detail-hero">
        <div class="skill-detail-hero-top">
          <div class="skill-detail-hero-main">
            <div class="skill-detail-hero-icon">
              <img
                class="skill-detail-hero-icon-img"
                :src="skillIcon"
                alt=""
                width="44"
                height="44"
              />
            </div>
            <div class="skill-detail-hero-copy">
              <div class="skill-detail-hero-title">{{ skillDisplayName }}</div>
            </div>
          </div>
          <div v-if="installed" class="skill-detail-switch">
            <span class="skill-detail-switch-label" :class="enabled ? 'is-enabled' : 'is-disabled'">
              {{ enabled ? t('routes.skillsEnabled') : t('routes.skillsDisabled') }}
            </span>
            <Switch
              class="skill-detail-switch-control"
              :model-value="enabled"
              @update:model-value="updateEnabled"
            />
          </div>
          <div v-else class="skill-detail-switch"></div>
        </div>
        <div class="skill-detail-hero-desc">{{ skillDescription }}</div>
        <div v-if="installed" class="skill-detail-actions">
          <Button class="skill-detail-btn-primary" :disabled="!enabled" @click="useSkill()">
            {{ t('routes.skillsUseSkill') }}
          </Button>

          <Button
            variant="outline"
            class="skill-detail-btn-secondary"
            @click="handleOpenSkillFolder"
          >
            <Icon icon="lucide:folder-open" class="skill-detail-btn-icon" />
            {{ t('routes.skillsOpenFolder') }}
          </Button>

          <Button
            v-if="canDeleteSkill"
            variant="outline"
            class="skill-detail-btn-danger"
            :disabled="uninstalling"
            @click="openUninstallConfirm"
          >
            <Icon
              :icon="uninstalling ? 'lucide:loader-circle' : 'lucide:trash-2'"
              class="skill-detail-btn-icon"
              :class="{ 'is-loading': uninstalling }"
            />
            {{ t('routes.skillsDelete') }}
          </Button>
        </div>
        <div v-else class="skill-detail-actions">
          <Button class="skill-detail-btn-primary" :disabled="installing" @click="handleInstall">
            {{ installing ? t('routes.skillsInstalling') : t('routes.skillsInstall') }}
          </Button>
        </div>
      </section>

      <section v-if="installed && skillTryPrompts.length" class="skill-detail-try">
        <div class="skill-detail-try-title">
          {{ t('routes.skillsTryTitle') }}
          <span class="skill-detail-try-subtitle">{{ t('routes.skillsTrySubtitle') }}</span>
        </div>
        <div class="skill-detail-try-grid">
          <button
            v-for="prompt in skillTryPrompts"
            :key="prompt"
            type="button"
            class="skill-detail-try-card"
            @click="useSkill(prompt)"
          >
            <span class="skill-detail-try-prompt">{{ prompt }}</span>
            <span class="skill-detail-try-link">
              {{ t('routes.skillsTryLink') }}
              <Icon icon="lucide:arrow-right" class="skill-detail-try-link-icon" />
            </span>
          </button>
        </div>
      </section>

      <template v-if="installed">
        <section class="skill-detail-source">
          <div class="skill-detail-source-tabs">
            <div class="skill-detail-source-header">
              <div class="skill-detail-source-title">{{ t('routes.skillsSourceTitle') }}</div>
              <div class="skill-detail-source-tablist">
                <button
                  type="button"
                  class="skill-detail-source-tab"
                  :class="{ 'is-active': sourceViewMode === 'preview' }"
                  :aria-label="t('routes.skillsRendered')"
                  @click="sourceViewMode = 'preview'"
                >
                  <img
                    :src="sourceViewMode === 'preview' ? previewActiveIcon : previewIcon"
                    alt=""
                    class="skill-detail-source-tab-icon is-preview"
                    draggable="false"
                  />
                </button>
                <button
                  type="button"
                  class="skill-detail-source-tab"
                  :class="{ 'is-active': sourceViewMode === 'source' }"
                  :aria-label="t('routes.skillsSourceCode')"
                  @click="sourceViewMode = 'source'"
                >
                  <img
                    :src="sourceViewMode === 'source' ? codeActiveIcon : codeIcon"
                    alt=""
                    class="skill-detail-source-tab-icon is-code"
                    draggable="false"
                  />
                </button>
              </div>
            </div>

            <div v-if="sourceViewMode === 'source'" class="skill-detail-source-content">
              <div v-if="skillMarkdownLoading" class="skill-detail-source-loading">
                <Icon
                  icon="lucide:loader-circle"
                  class="skill-detail-source-loading-icon is-loading"
                />
              </div>
              <div v-else-if="skillMarkdownError" class="skill-detail-source-error">
                {{ skillMarkdownError }}
              </div>
              <pre v-else class="skill-detail-source-code"><code>{{ skillMarkdown }}</code></pre>
            </div>

            <div v-else class="skill-detail-source-content">
              <div v-if="skillMarkdownLoading" class="skill-detail-source-loading">
                <Icon
                  icon="lucide:loader-circle"
                  class="skill-detail-source-loading-icon is-loading"
                />
              </div>
              <div v-else-if="skillMarkdownError" class="skill-detail-source-error">
                {{ skillMarkdownError }}
              </div>
              <div v-else class="skill-detail-source-preview">
                <MarkdownRenderer
                  :content="skillMarkdown"
                  :message-id="`skill-preview-${currentSkillName}`"
                  :thread-id="`skill-preview-${currentSkillName}`"
                  :smooth-streaming="false"
                />
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <div
      v-if="uninstallConfirmOpen"
      class="skill-detail-uninstall-mask"
      @click.self="closeUninstallConfirm"
    >
      <div
        class="skill-detail-uninstall-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="skill-detail-uninstall-title"
        @click.stop
      >
        <div id="skill-detail-uninstall-title" class="skill-detail-uninstall-title">
          {{ t('routes.skillsDeleteConfirmTitle') }}
        </div>
        <div class="skill-detail-uninstall-desc">
          {{
            t('routes.skillsDeleteConfirmDescription', {
              name: skillDisplayName || currentSkillName
            })
          }}
        </div>
        <div class="skill-detail-uninstall-footer">
          <Button
            variant="outline"
            class="skill-detail-uninstall-cancel"
            :disabled="uninstalling"
            @click="closeUninstallConfirm"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            class="skill-detail-uninstall-confirm"
            :disabled="uninstalling"
            @click="uninstallSkill"
          >
            {{ t('routes.skillsDelete') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
