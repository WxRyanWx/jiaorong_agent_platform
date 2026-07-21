<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
import {
  openSkillFolder,
  readSkillMarkdown,
  showGlobalSuccessToast,
  startGeneralChatWithSkills,
  uninstallSkill as uninstallRealSkill
} from '@jiaorong/utils'
import {
  getMockSkill,
  installMockSkill,
  setMockSkillEnabled,
  applyMockSkillUninstalled
} from '@jiaorong/skills/services'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { toast } = useToast()
const installing = ref(false)
const uninstalling = ref(false)
const skillMarkdown = ref('')
const skillMarkdownLoading = ref(false)
const skillMarkdownError = ref('')
// 当前阶段卸载仅更新 Mock 数据；设为 false 即可恢复下方保留的真实卸载流程。
const USE_MOCK_SKILL_UNINSTALL = true
let installTimer: ReturnType<typeof setTimeout> | undefined

const skillId = computed(() => String(route.params.skillId ?? ''))
const skill = computed(() => getMockSkill(skillId.value))

watch(
  skillId,
  async (currentSkillId, _previousSkillId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    skillMarkdown.value = ''
    skillMarkdownError.value = ''
    if (!currentSkillId || !getMockSkill(currentSkillId)?.installed) return

    skillMarkdownLoading.value = true
    try {
      const content = await readSkillMarkdown(currentSkillId)
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

const installSkill = () => {
  if (!skill.value || installing.value) return
  installing.value = true
  installTimer = setTimeout(() => {
    installMockSkill(skillId.value)
    installing.value = false
  }, 600)
}

const updateEnabled = (enabled: boolean) => {
  setMockSkillEnabled(skillId.value, enabled)
}

const useSkill = async () => {
  if (!skill.value) return
  await startGeneralChatWithSkills({
    router,
    prompt: '',
    skillNames: [skill.value.id]
  })
}

const trySkill = async (prompt: string) => {
  if (!skill.value) return
  await startGeneralChatWithSkills({
    router,
    prompt,
    skillNames: [skill.value.id]
  })
}

const handleOpenSkillFolder = async () => {
  if (!skill.value) return

  try {
    await openSkillFolder(skill.value.id)
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
  if (!currentSkill || uninstalling.value) return

  if (USE_MOCK_SKILL_UNINSTALL) {
    const source = applyMockSkillUninstalled(currentSkill.id)
    if (!source) return

    showGlobalSuccessToast(t('routes.skillsUninstallSuccess'))

    if (source === 'local') {
      await router.push({ name: 'skills' })
    }
    return
  }

  // 保留真实卸载逻辑，后续关闭 Mock 开关即可重新启用。
  uninstalling.value = true
  const result = await uninstallRealSkill(currentSkill.id)
  uninstalling.value = false

  if (!result.success) {
    toast({
      title: t('routes.skillsUninstallFailed'),
      description: result.error || t('routes.skillsUnknownError'),
      variant: 'destructive'
    })
    return
  }

  const source = applyMockSkillUninstalled(currentSkill.id)
  if (!source) return

  showGlobalSuccessToast(t('routes.skillsUninstallSuccess'))

  if (source === 'local') {
    await router.push({ name: 'skills' })
  }
}

onBeforeUnmount(() => {
  if (installTimer) clearTimeout(installTimer)
})
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="h-full w-full overflow-y-auto bg-muted/20">
      <main class="mx-auto max-w-5xl px-6 py-8 md:px-8 md:py-10">
        <Button variant="ghost" class="mb-6 -ml-3 gap-2" @click="goBack">
          <Icon icon="lucide:arrow-left" class="h-4 w-4" />
          {{ t('routes.skillsBackToList') }}
        </Button>

        <div v-if="!skill" class="rounded-xl border bg-card p-10 text-center shadow-sm">
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
                  <h1 class="text-2xl font-semibold tracking-tight">{{ skill.name }}</h1>
                  <p
                    v-if="skill.source === 'market'"
                    class="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground"
                  >
                    {{ skill.description }}
                  </p>
                </div>
              </div>

              <div v-if="skill.installed" class="flex shrink-0 items-center gap-3">
                <span class="text-sm text-muted-foreground">
                  {{ skill.enabled ? t('routes.skillsEnabled') : t('routes.skillsDisabled') }}
                </span>
                <Switch :model-value="skill.enabled" @update:model-value="updateEnabled" />
              </div>
            </div>

            <div v-if="!skill.installed" class="mt-7 border-t pt-6">
              <Button :disabled="installing" class="min-w-28 gap-2" @click="installSkill">
                <Icon
                  :icon="installing ? 'lucide:loader-circle' : 'lucide:download'"
                  :class="['h-4 w-4', installing && 'animate-spin']"
                />
                {{ installing ? t('routes.skillsInstalling') : t('routes.skillsInstall') }}
              </Button>
            </div>

            <div v-else class="mt-7 flex flex-wrap items-center gap-3 border-t pt-6">
              <Button class="gap-2" :disabled="!skill.enabled" @click="useSkill">
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
                    :disabled="uninstalling"
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

          <template v-if="skill.installed">
            <section
              v-if="skill.source === 'market' && skill.tryPrompts.length > 0"
              class="mt-6 rounded-xl border bg-card p-6 shadow-sm md:p-8"
            >
              <h2 class="text-lg font-semibold">{{ t('routes.skillsTryTitle') }}</h2>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  v-for="prompt in skill.tryPrompts"
                  :key="prompt"
                  type="button"
                  class="group flex items-start justify-between gap-4 rounded-lg border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!skill.enabled"
                  @click="trySkill(prompt)"
                >
                  <span class="text-sm leading-6 text-foreground">{{ prompt }}</span>
                  <Icon
                    icon="lucide:arrow-up-right"
                    class="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
                  />
                </button>
              </div>
            </section>

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
                      :message-id="`skill-preview-${skill.id}`"
                      :thread-id="`skill-preview-${skill.id}`"
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
