<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {Icon} from '@iconify/vue'
import {Button} from '@shadcn/components/ui/button'
import {Switch} from '@shadcn/components/ui/switch'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import {useToast} from '@/components/use-toast'
import {getSkillDetail, type SkillDetailResponse} from '@jiaorong/api/skills'
import {
  disableSkill,
  enableSkill,
  getSkillSwitchStatus,
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
  readJiaorongSkillFromSession,
  SkillSource,
  type JiaorongSkillItem
} from '../../lib/sessionSkill'
import skillIcon from '@jiaorong/assets/skill.png'

const route = useRoute()
const router = useRouter()
const {t} = useI18n()
const {toast} = useToast()
const uninstalling = ref(false)
const uninstallConfirmOpen = ref(false)
const skillMarkdown = ref('')
const skillMarkdownLoading = ref(false)
const skillMarkdownError = ref('')
const skill = ref<JiaorongSkillItem | null>(readJiaorongSkillFromSession())
const remoteSkillDetail = ref<SkillDetailResponse | null>(null)
const installed = ref(false)
const enabled = ref(true)
const sourceViewMode = ref<'source' | 'preview'>('source')
/** TODO: UI 调试用，后端 tryPrompts 就绪后删除 */
const MOCK_TRY_PROMPTS = [
  'Generate an activity poster for a “Spring Coffee Festival”: soft pastel palette, latte-art motifs, playful typography, and a clear schedule block.',
  'Design a tech conference keynote poster: deep navy and electric blue, geometric background, bold title hierarchy, and speaker lineup area.',
  'Create a community charity run poster: energetic red/orange accents, route map callout, registration QR placeholder, and safety notes.',
  'Make a product launch poster for wireless earbuds: minimal black/white layout, product hero shot area, feature bullets, and release date.',
  'Design a campus club fair poster: bright multi-color blocks, booth map, club categories, and a friendly mascot space.',
  'Create a jazz night poster: vintage paper texture, warm amber lighting, elegant serif title, and setlist/time details.',
  'Generate a food delivery promo poster: appetizing photo frame, discount badge, delivery time promise, and app download cue.',
  'Design a winter ski resort poster: cool blue-white gradient, mountain silhouette, package pricing, and booking CTA.'
]

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
const skillTryPrompts = computed(() => {
  const prompts = remoteSkillDetail.value?.tryPrompts ?? []
  return prompts.length > 0 ? prompts : MOCK_TRY_PROMPTS
})
const hasSkillDetail = computed(() => Boolean(skill.value || remoteSkillDetail.value))

watch(
  skillId,
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    remoteSkillDetail.value = null
    const id = currentSkillId.trim()
    if (!id) return

    try {
      const detail = await getSkillDetail(id)
      if (!cancelled) remoteSkillDetail.value = detail
    } catch (error) {
      console.error(`[SkillDetailPage] Failed to load remote skill detail for ${id}:`, error)
    }
  },
  {immediate: true}
)

watch(
  skillId,
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    const storedSkill = readJiaorongSkillFromSession()
    skill.value = currentSkillId
      ? storedSkill?.name === currentSkillId
        ? storedSkill
        : null
      : storedSkill
    const name = skill.value?.name || currentSkillId
    installed.value = isSkillInstalled(name)
    enabled.value = getSkillSwitchStatus(name) === SkillSwitchStatus.On
    const result = await isSkillInstalledAsync(name)
    if (!cancelled) installed.value = result
  },
  {immediate: true}
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
      const content = await readSkillMarkdown(id)
      if (!cancelled) skillMarkdown.value = content
    } catch (error) {
      if (!cancelled) {
        skillMarkdownError.value =
          error instanceof Error ? error.message : t('routes.skillsUnknownError')
      }
    } finally {
      if (!cancelled) skillMarkdownLoading.value = false
    }
  },
  {immediate: true}
)

const goBack = () => {
  void router.push({name: 'skills'})
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
  if (!installed.value || !currentSkillName.value || uninstalling.value) return
  uninstallConfirmOpen.value = true
}

const closeUninstallConfirm = () => {
  if (uninstalling.value) return
  uninstallConfirmOpen.value = false
}

const uninstallSkill = async () => {
  const name = currentSkillName.value
  if (!name || uninstalling.value) return

  uninstallConfirmOpen.value = false
  uninstalling.value = true
  const result = await uninstallRealSkill(name)
  if (!result.success) {
    uninstalling.value = false
    toast({
      title: t('routes.skillsUninstallFailed'),
      description: result.error || t('routes.skillsUnknownError'),
      variant: 'destructive'
    })
    return
  }
  uninstalling.value = false
  installed.value = false
  showGlobalSuccessToast(t('routes.skillsUninstallSuccess'))

  if (skill.value?.skill_source !== SkillSource.RemoteApi) {
    await router.push({name: 'skills'})
  }
}
</script>

<template>
  <div class="skill-detail-page">
    <div class="skill-detail-page-scroll">
    <div class="skill-detail-nav">
      <Button variant="ghost" class="skill-detail-back" @click="goBack">
        <Icon icon="lucide:arrow-left" class="skill-detail-back-icon"/>
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
            <span
              class="skill-detail-switch-label"
              :class="enabled ? 'is-enabled' : 'is-disabled'"
            >
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
        <Button
          class="skill-detail-btn-primary"
          :disabled="!enabled"
          @click="useSkill()"
        >
          {{ t('routes.skillsUseSkill') }}
        </Button>

        <Button
          variant="outline"
          class="skill-detail-btn-secondary"
          @click="handleOpenSkillFolder"
        >
          <Icon icon="lucide:folder-open" class="skill-detail-btn-icon"/>
          {{ t('routes.skillsOpenFolder') }}
        </Button>

        <Button
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

    </section>

    <section v-if="skillTryPrompts.length" class="skill-detail-try">
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
              <Icon icon="lucide:arrow-right" class="skill-detail-try-link-icon"/>
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
                <Icon icon="lucide:eye" class="skill-detail-source-tab-icon"/>
              </button>
              <button
                type="button"
                class="skill-detail-source-tab"
                :class="{ 'is-active': sourceViewMode === 'source' }"
                :aria-label="t('routes.skillsSourceCode')"
                @click="sourceViewMode = 'source'"
              >
                <Icon icon="lucide:code-xml" class="skill-detail-source-tab-icon"/>
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

<style lang="less" scoped>
@keyframes skill-detail-spin {
  to {
    transform: rotate(360deg);
  }
}

.skill-detail-page {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  container-type: inline-size;
  container-name: skill-detail;

  .skill-detail-page-scroll {
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 20px 32px 30px;
  }

  .skill-detail-uninstall-mask {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    // less 会把 `rgb(... / 80%)` 的 `/` 当成除法，写成 rgba 才能保留透明度
    background: rgba(0, 0, 0, 0.8);
    -webkit-app-region: no-drag;
  }

  .skill-detail-uninstall-dialog {
    width: 100%;
    max-width: 28rem;
    border-radius: 8px;
    border: 1px solid var(--border, #e5e6eb);
    background: var(--background, #ffffff);
    padding: 24px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    -webkit-app-region: no-drag;
    pointer-events: auto;
  }

  .skill-detail-uninstall-title {
    font-size: 16px;
    font-weight: 600;
    color: #1d2129;
    line-height: 24px;
  }

  .skill-detail-uninstall-desc {
    margin-top: 8px;
    font-size: 14px;
    line-height: 22px;
    color: #4e5969;
  }

  .skill-detail-uninstall-footer {
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .skill-detail-uninstall-cancel,
  .skill-detail-uninstall-confirm {
    -webkit-app-region: no-drag;
    pointer-events: auto;
    cursor: pointer;
  }

  .skill-detail-uninstall-confirm {
    background: #e5484d;
    color: #ffffff;
    border-color: #e5484d;

    &:hover:not(:disabled) {
      background: #d14347 !important;
      border-color: #d14347 !important;
      color: #ffffff !important;
    }
  }

  .skill-detail-nav {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;

    .skill-detail-back {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 12px;
      flex-shrink: 0;
      background: #ffffff;
      border-radius: 7px;
      border: 1px solid #d1deed;
      color: #1f2a44;
      box-shadow: none;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;

      &:hover:not(:disabled) {
        background: #f5f8fc !important;
        border-color: #b9d0f2 !important;
        color: #1f2a44 !important;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .skill-detail-back-icon {
        width: 16px;
        height: 16px;
      }
    }

    .skill-detail-breadcrumb {
      margin-left: 0;
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: 'Noto Sans SC', sans-serif;
      font-weight: 400;
      font-size: 12px;
      color: #86919c;
      text-align: left;
      font-style: normal;
      text-transform: none;
    }
  }

  .skill-detail-hero {
    background: #ffffff;
    border-radius: 10px;
    border: 1px solid #e5e6eb;
    width: 100%;
    margin-top: 20px;
    padding: 16px 20px;
    box-sizing: border-box;

    .skill-detail-hero-top {
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;

      .skill-detail-hero-main {
        display: flex;
        align-items: center;
        min-width: 0;
        flex: 1;

        .skill-detail-hero-icon {
          width: 44px;
          height: 44px;
          flex-shrink: 0;

          .skill-detail-hero-icon-img {
            display: block;
            width: 44px;
            height: 44px;
            object-fit: contain;
          }
        }

        .skill-detail-hero-copy {
          margin-left: 12px;
          min-width: 0;
          font-family: 'Noto Sans SC', sans-serif;
          font-size: 20px;
          color: #1d2129;
          font-weight: bold;
          text-align: left;
          font-style: normal;
          text-transform: none;

          .skill-detail-hero-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      }

      .skill-detail-switch {
        display: flex;
        align-items: center;
        flex-shrink: 0;

        .skill-detail-switch-label {
          font-family: 'Noto Sans SC', sans-serif;
          font-weight: bold;
          font-size: 12px;
          color: #00b42a;
          line-height: 18px;
          text-align: left;
          font-style: normal;
          text-transform: none;

          &.is-disabled {
            color: #86919c;
          }
        }

        .skill-detail-switch-control {
          margin-left: 8px;
        }
      }
    }

    .skill-detail-hero-desc {
      width: 100%;
      padding-left: 60px;
      margin: 10px 0;
      box-sizing: border-box;
      font-family: 'Noto Sans SC', sans-serif;
      font-weight: 400;
      font-size: 13px;
      color: #4e5969;
      line-height: 20px;
      text-align: left;
      font-style: normal;
      text-transform: none;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .skill-detail-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-left: 60px;
      box-sizing: border-box;

      .skill-detail-btn-primary,
      .skill-detail-btn-secondary,
      .skill-detail-btn-danger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-left: 0;
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease,
          opacity 0.15s ease;

        &:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .skill-detail-btn-icon {
          width: 16px;
          height: 16px;

          &.is-loading {
            animation: skill-detail-spin 0.8s linear infinite;
          }
        }
      }

      .skill-detail-btn-primary {
        background: #006eff;
        color: #ffffff;
        min-width: 108px;
        border-color: #006eff;
      }

      .skill-detail-btn-secondary {
        background: #ffffff;
        color: #1f2a44;
        border: 1px solid #c9cdd4;
      }

      .skill-detail-btn-danger {
        background: #fff0f0;
        color: #e5484d;
        border: 1px solid transparent;
      }
    }
  }

  .skill-detail-try {
    margin-top: 20px;

    .skill-detail-try-title {
      min-height: 24px;
      font-family: 'Noto Sans SC', sans-serif;
      font-weight: bold;
      font-size: 16px;
      color: #0b2e57;
      margin-bottom: 10px;
      line-height: 24px;

      .skill-detail-try-subtitle {
        font-weight: bold;
        font-size: 12px;
        color: #8794a6;
        text-align: left;
        font-style: normal;
        text-transform: none;
      }
    }

    .skill-detail-try-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      width: 100%;

      .skill-detail-try-card {
        width: 100%;
        min-width: 0;
        background: #ffffff;
        border-radius: 8px;
        border: 1px solid #d8e2ee;
        min-height: 134px;
        height: auto;
        display: flex;
        padding: 14px;
        box-sizing: border-box;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;

        .skill-detail-try-prompt {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 4;
          line-clamp: 4;
          overflow: hidden;
          text-align: left;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .skill-detail-try-link {
          display: flex;
          align-items: center;
          color: #006eff;
          flex-shrink: 0;

          .skill-detail-try-link-icon {
            margin-left: 2px;
          }
        }
      }
    }
  }

  .skill-detail-source {
    width: 100%;
    margin-top: 16px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #d8e2ee;
    box-sizing: border-box;
    overflow: hidden;

    .skill-detail-source-tabs {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;

      .skill-detail-source-header {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        min-height: 52px;
        padding: 0 16px;
        box-sizing: border-box;

        .skill-detail-source-title {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: 'Noto Sans SC', sans-serif;
          font-weight: 500;
          font-size: 16px;
          color: #0b2e57;
          text-align: left;
          font-style: normal;
          text-transform: none;
        }

        .skill-detail-source-tablist {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;

          .skill-detail-source-tab {
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 56px;
            height: 28px;
            padding: 0;
            cursor: pointer;
            background: #ffffff;
            border-radius: 6px;
            border: 1px solid #d6e0ed;
            color: #4f6178;

            &.is-active {
              background: #e5f2ff;
              border: 1px solid #94bfff;
              color: #006eff;
            }

            .skill-detail-source-tab-icon {
              width: 16px;
              height: 16px;
            }
          }
        }
      }

      .skill-detail-source-content {
        width: 100%;
        min-width: 0;
        padding: 18px 24px;
        box-sizing: border-box;
        overflow: hidden;
        background: #fbfcff;

        .skill-detail-source-loading-icon.is-loading {
          animation: skill-detail-spin 0.8s linear infinite;
        }

        .skill-detail-source-error {
          height: 100px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .skill-detail-source-code {
          margin: 0;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;

          code {
            display: block;
            max-width: 100%;
            white-space: inherit;
            overflow-wrap: inherit;
            word-break: inherit;
          }
        }

        .skill-detail-source-preview {
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          overflow-x: auto;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
      }
    }
  }

  @container skill-detail (max-width: 720px) {
    .skill-detail-page-scroll {
      padding: 16px 20px 24px;
    }

    .skill-detail-hero {
      margin-top: 16px;
      padding: 14px 16px;

      .skill-detail-hero-top {
        .skill-detail-hero-main {
          .skill-detail-hero-copy {
            font-size: 18px;
          }
        }
      }

      .skill-detail-hero-desc,
      .skill-detail-actions {
        padding-left: 0;
      }
    }

    .skill-detail-try {
      margin-top: 16px;

      .skill-detail-try-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
    }

    .skill-detail-source {
      .skill-detail-source-tabs {
        .skill-detail-source-content {
          padding: 14px 16px;
        }
      }
    }
  }

  @container skill-detail (max-width: 520px) {
    .skill-detail-page-scroll {
      padding: 12px 14px 20px;
    }

    .skill-detail-hero {
      .skill-detail-hero-top {
        flex-wrap: wrap;
        align-items: flex-start;

        .skill-detail-hero-main {
          width: 100%;

          .skill-detail-hero-copy {
            font-size: 16px;
          }
        }
      }

      .skill-detail-actions {
        .skill-detail-btn-primary,
        .skill-detail-btn-secondary,
        .skill-detail-btn-danger {
          flex: 1 1 auto;
          min-width: calc(50% - 4px);
        }
      }
    }

    .skill-detail-try {
      .skill-detail-try-title {
        height: auto;

        .skill-detail-try-subtitle {
          display: block;
          margin-top: 4px;
        }
      }

      .skill-detail-try-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .skill-detail-source {
      .skill-detail-source-tabs {
        .skill-detail-source-header {
          padding: 0 12px;
        }

        .skill-detail-source-content {
          padding: 12px;
        }
      }
    }

    .skill-detail-uninstall-dialog {
      padding: 20px 16px;
    }
  }
}
</style>
