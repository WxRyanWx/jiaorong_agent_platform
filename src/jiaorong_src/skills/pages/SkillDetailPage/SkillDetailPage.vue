<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Switch } from '@shadcn/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shadcn/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import { useToast } from '@/components/use-toast'
import { getSkillDetail, type SkillDetailResponse } from '@jiaorong/api/skills'
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

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { toast } = useToast()
const uninstalling = ref(false)
const skillMarkdown = ref('')
const skillMarkdownLoading = ref(false)
const skillMarkdownError = ref('')
const skill = ref<JiaorongSkillItem | null>(readJiaorongSkillFromSession())
const remoteSkillDetail = ref<SkillDetailResponse | null>(null)
const installed = ref(false)
const enabled = ref(true)
const USE_MOCK_SKILL_UNINSTALL = true
const MOCK_UNINSTALL_DELAY_MS = 300

const skillId = computed(() => String(route.params.skillId ?? ''))
const currentSkillName = computed(() => skill.value?.name || skillId.value)
const canUninstall = computed(
  () => Boolean(skill.value) && skill.value?.skill_source !== SkillSource.LocalBuiltin
)
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
const skillTryPrompts = computed(() => remoteSkillDetail.value?.tryPrompts ?? [])
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
  { immediate: true }
)

const goBack = () => {
  void router.push({ name: 'skills' })
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

const uninstallSkill = async () => {
  const currentSkill = skill.value
  if (!currentSkill || !canUninstall.value || uninstalling.value) return

  uninstalling.value = true
  if (USE_MOCK_SKILL_UNINSTALL) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_UNINSTALL_DELAY_MS))
  } else {
    const result = await uninstallRealSkill(currentSkill.name)
    if (!result.success) {
      uninstalling.value = false
      toast({
        title: t('routes.skillsUninstallFailed'),
        description: result.error || t('routes.skillsUnknownError'),
        variant: 'destructive'
      })
      return
    }
  }
  uninstalling.value = false

  installed.value = false

  showGlobalSuccessToast(t('routes.skillsUninstallSuccess'))

  if (currentSkill.skill_source !== SkillSource.RemoteApi) {
    await router.push({ name: 'skills' })
  }
}
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="h-full w-full overflow-y-auto bg-muted/20">
      <main class="mx-auto max-w-5xl px-6 py-8 md:px-8 md:py-10">
        <Button variant="ghost" class="mb-6 -ml-3 gap-2" @click="goBack">
          <Icon icon="lucide:arrow-left" class="h-4 w-4" />
          {{ t('routes.skillsBackToList') }}
        </Button>

        <div v-if="!hasSkillDetail" class="rounded-xl border bg-card p-10 text-center shadow-sm">
          <Icon icon="lucide:circle-help" class="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 class="mt-4 text-xl font-semibold">{{ t('routes.skillsNotFound') }}</h1>
          <Button class="mt-6" @click="goBack">{{ t('routes.skillsBackToList') }}</Button>
        </div>

        <template v-else>
          <section class="rounded-xl border bg-card p-6 shadow-sm md:p-8">
            <div class="flex items-start justify-between gap-6">
              <div class="flex min-w-0 items-start gap-4">
                <div
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  <Icon icon="lucide:sparkles" class="h-6 w-6" />
                </div>
                <div class="min-w-0">
                  <h1 class="text-2xl font-semibold tracking-tight">{{ skillDisplayName }}</h1>
                  <p class="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                    {{ skillDescription }}
                  </p>
                </div>
              </div>

              <div v-if="installed" class="flex shrink-0 items-center gap-3">
                <span class="text-sm text-muted-foreground">
                  {{ enabled ? t('routes.skillsEnabled') : t('routes.skillsDisabled') }}
                </span>
                <Switch :model-value="enabled" @update:model-value="updateEnabled" />
              </div>
            </div>

            <div v-if="installed" class="mt-7 flex flex-wrap items-center gap-3 border-t pt-6">
              <Button class="gap-2" :disabled="!enabled" @click="useSkill()">
                <Icon icon="lucide:message-square" class="h-4 w-4" />
                {{ t('routes.skillsUse') }}
              </Button>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="outline" size="icon" @click="handleOpenSkillFolder">
                    <Icon icon="lucide:folder-open" class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('routes.skillsOpenFolderTip') }}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="icon"
                    :disabled="!canUninstall || uninstalling"
                    @click="uninstallSkill"
                  >
                    <Icon
                      :icon="uninstalling ? 'lucide:loader-circle' : 'lucide:trash-2'"
                      :class="['h-4 w-4 text-destructive', uninstalling && 'animate-spin']"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('routes.skillsUninstallTip') }}</TooltipContent>
              </Tooltip>
            </div>
          </section>

          <section
            v-if="skillTryPrompts.length"
            class="mt-6 rounded-xl border bg-card p-6 shadow-sm md:p-8"
          >
            <h2 class="mb-4 text-lg font-semibold">{{ t('routes.skillsTryTitle') }}</h2>
            <div class="flex flex-col gap-3">
              <button
                v-for="prompt in skillTryPrompts"
                :key="prompt"
                type="button"
                class="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
                @click="useSkill(prompt)"
              >
                <span>{{ prompt }}</span>
                <Icon icon="lucide:arrow-up-right" class="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </div>
          </section>

          <template v-if="installed">
            <section class="mt-6 rounded-xl border bg-card p-6 shadow-sm md:p-8">
              <h2 class="mb-5 text-lg font-semibold">{{ t('routes.skillsSourceTitle') }}</h2>
              <Tabs default-value="source">
                <TabsList>
                  <TabsTrigger value="source">{{ t('routes.skillsSourceCode') }}</TabsTrigger>
                  <TabsTrigger value="preview">{{ t('routes.skillsRendered') }}</TabsTrigger>
                </TabsList>
                <TabsContent value="source" class="mt-4">
                  <div
                    v-if="skillMarkdownLoading"
                    class="flex min-h-40 items-center justify-center rounded-lg border bg-muted/40"
                  >
                    <Icon icon="lucide:loader-circle" class="h-5 w-5 animate-spin" />
                  </div>
                  <div
                    v-else-if="skillMarkdownError"
                    class="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
                  >
                    {{ skillMarkdownError }}
                  </div>
                  <pre
                    v-else
                    class="max-h-[560px] overflow-auto rounded-lg border bg-muted/40 p-5 text-xs leading-6"
                  ><code>{{ skillMarkdown }}</code></pre>
                </TabsContent>
                <TabsContent value="preview" class="mt-4">
                  <div
                    v-if="skillMarkdownLoading"
                    class="flex min-h-40 items-center justify-center rounded-lg border bg-background"
                  >
                    <Icon icon="lucide:loader-circle" class="h-5 w-5 animate-spin" />
                  </div>
                  <div
                    v-else-if="skillMarkdownError"
                    class="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
                  >
                    {{ skillMarkdownError }}
                  </div>
                  <div v-else class="min-h-40 rounded-lg border bg-background p-5">
                    <MarkdownRenderer
                      :content="skillMarkdown"
                      :message-id="`skill-preview-${currentSkillName}`"
                      :thread-id="`skill-preview-${currentSkillName}`"
                      :smooth-streaming="false"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </section>
          </template>
        </template>
      </main>
    </div>
  </TooltipProvider>
</template>
