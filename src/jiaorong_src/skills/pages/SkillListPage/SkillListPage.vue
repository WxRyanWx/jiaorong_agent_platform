<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@shadcn/components/ui/dropdown-menu'
import { startGeneralChatWithSkills } from '@jiaorong/utils'
import { getMockSkills } from '@jiaorong/skills/services'

const CREATE_SKILL_PROMPT = '创建一个新的技能，这个技能的功能是：'
const SKILL_CREATOR_NAME = 'skill-creator'

const router = useRouter()
const { t } = useI18n()
const skills = getMockSkills()

const createSkill = async () => {
  await startGeneralChatWithSkills({
    router,
    prompt: CREATE_SKILL_PROMPT,
    skillNames: [SKILL_CREATOR_NAME]
  })
}

const openSkillDetail = (skillId: string) => {
  void router.push({ name: 'skills-detail', params: { skillId } })
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-muted/20 p-6 md:p-8">
    <div class="mx-auto max-w-6xl">
      <div class="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">{{ t('routes.skillsPageTitle') }}</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ t('routes.skillsPageSubtitle') }}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button class="gap-2">
              <Icon icon="lucide:plus" class="h-4 w-4" />
              <span>{{ t('routes.skillsCreateButton') }}</span>
              <Icon icon="lucide:chevron-down" class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="min-w-36">
            <DropdownMenuItem class="gap-2" @select="createSkill">
              <Icon icon="lucide:wand-sparkles" class="h-4 w-4" />
              <span>{{ t('routes.skillsCreateAction') }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="skill in skills"
          :key="skill.id"
          type="button"
          class="group flex min-h-52 flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          @click="openSkillDetail(skill.id)"
        >
          <div class="mb-5 flex items-start justify-between gap-4">
            <div
              class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Icon icon="lucide:sparkles" class="h-5 w-5" />
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {{
                  skill.source === 'market'
                    ? t('routes.skillsMarketSource')
                    : t('routes.skillsLocalSource')
                }}
              </span>
              <span
                :class="[
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  skill.installed
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                ]"
              >
                {{ skill.installed ? t('routes.skillsInstalled') : t('routes.skillsNotInstalled') }}
              </span>
            </div>
          </div>
          <h2 class="font-semibold text-foreground">{{ skill.name }}</h2>
          <p class="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
            {{ skill.description || t('routes.skillsNoDescription') }}
          </p>
          <div class="mt-5 flex items-center text-sm font-medium text-primary">
            {{ t('routes.skillsViewDetail') }}
            <Icon
              icon="lucide:arrow-right"
              class="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
            />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
