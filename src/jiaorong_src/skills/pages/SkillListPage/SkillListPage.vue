<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Input } from '@shadcn/components/ui/input'
import { useSkillsStore } from '@/stores/skillsStore'
import type { SkillMetadata } from '@shared/types/skill'
import { startGeneralChatWithSkills } from '@jiaorong/utils'
import {
  BUILTIN_SKILL_NAMES,
  type JiaorongSkillItem,
  getRememberedSkillSource,
  rememberSkillSource,
  saveJiaorongSkillToSession,
  SkillSource,
  toJiaorongSkillItem
} from '../../lib/sessionSkill'
import SkillUploadDialog from '../../components/SkillUploadDialog/SkillUploadDialog.vue'

type MarketTab = 'market' | 'installed'

const router = useRouter()
const skillsStore = useSkillsStore()

const activeTab = ref<MarketTab>('market')
const searchQuery = ref('')
const activeCategory = ref('全部')
const createMenuOpen = ref(false)
const uploadDialogOpen = ref(false)

const CATEGORY_FALLBACK = '通用'

function getSkillDisplayName(skill: SkillMetadata): string {
  const displayName = skill.metadata?.displayName
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim()
  }
  return skill.name
}

function getSkillCategory(skill: SkillMetadata): string {
  if (typeof skill.category === 'string' && skill.category.trim()) {
    const leaf = skill.category.split(/[/\\]/).filter(Boolean).pop()
    return leaf || CATEGORY_FALLBACK
  }
  const metaCategory = skill.metadata?.category
  if (typeof metaCategory === 'string' && metaCategory.trim()) {
    return metaCategory.trim()
  }
  return CATEGORY_FALLBACK
}

function getSkillIcon(skill: SkillMetadata): string {
  const icon = skill.metadata?.icon
  if (typeof icon === 'string' && icon.trim()) {
    return icon.trim()
  }
  return 'lucide:wand-sparkles'
}

/** 本地已发现技能一律视为已安装（内置技能启动时已写入 skills 目录） */
function isInstalled(_skill: SkillMetadata): boolean {
  return true
}

/** 按持久化来源 / 内置名集合解析 skill_source（1 内置 2 远程 3 文件夹 4 zip 5 md） */
const skillItems = computed((): JiaorongSkillItem[] =>
  skillsStore.skills.map((skill) => toJiaorongSkillItem(skill))
)

const categories = computed(() => {
  const set = new Set<string>()
  for (const skill of skillItems.value) {
    set.add(getSkillCategory(skill))
  }
  return ['全部', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
})

/** 按分类 + 搜索关键字过滤；不负责改写 skill 字段 */
const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return skillItems.value.filter((skill) => {
    if (activeCategory.value !== '全部' && getSkillCategory(skill) !== activeCategory.value) {
      return false
    }
    if (!q) {
      return true
    }
    const haystack =
      `${getSkillDisplayName(skill)} ${skill.name} ${skill.description}`.toLowerCase()
    return haystack.includes(q)
  })
})

const installedCount = computed(() => skillItems.value.length)

const openDetail = (skill: JiaorongSkillItem) => {
  saveJiaorongSkillToSession(skill)
  void router.push({ name: 'skills-detail', params: { skillId: skill.name } })
}

/** 「使用」：携带该技能进入新的通用对话（与详情页一致） */
const handleUse = async (skill: JiaorongSkillItem) => {
  await startGeneralChatWithSkills({
    router,
    prompt: '',
    skillNames: [skill.name]
  })
}

const handleInstall = (_skill: JiaorongSkillItem) => {
  // 远程市场接入后：调安装接口再刷新。本地内置技能已是已安装态。
}

const toggleCreateMenu = () => {
  createMenuOpen.value = !createMenuOpen.value
}

const closeCreateMenu = () => {
  createMenuOpen.value = false
}

const createSkill = async () => {
  closeCreateMenu()
  await startGeneralChatWithSkills({
    router,
    prompt: '创建一个新的技能，这个技能的功能是：',
    skillNames: ['skill-creator']
  })
}

const openUploadDialog = () => {
  closeCreateMenu()
  uploadDialogOpen.value = true
}

const onSkillUploaded = () => {
  void skillsStore.loadSkills()
}

onMounted(() => {
  // 把系统内置技能名写入来源表（不覆盖用户已记录的上传来源）
  for (const name of BUILTIN_SKILL_NAMES) {
    if (getRememberedSkillSource(name) == null) {
      rememberSkillSource(name, SkillSource.LocalBuiltin)
    }
  }
  void skillsStore.loadSkills()
})
</script>

<template>
  <div
    class="skill-center-page flex h-full min-h-0 w-full flex-col bg-background"
    @click="closeCreateMenu"
  >
    <!-- Header: tabs + create -->
    <div
      class="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-6 pt-4"
    >
      <div class="flex items-end gap-6">
        <button
          type="button"
          class="relative pb-3 text-sm font-medium transition-colors"
          :class="
            activeTab === 'market' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          "
          @click.stop="activeTab = 'market'"
        >
          技能市场
          <span
            v-if="activeTab === 'market'"
            class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
          />
        </button>
        <button
          type="button"
          class="relative pb-3 text-sm font-medium transition-colors"
          :class="
            activeTab === 'installed'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click.stop="activeTab = 'installed'"
        >
          已安装 {{ installedCount }}
          <span
            v-if="activeTab === 'installed'"
            class="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
          />
        </button>
      </div>

      <div class="relative mb-2" @click.stop>
        <Button size="sm" class="gap-1.5" @click="toggleCreateMenu">
          <Icon icon="lucide:plus" class="h-4 w-4" />
          新建技能
          <Icon icon="lucide:chevron-down" class="h-3.5 w-3.5 opacity-70" />
        </Button>
        <div
          v-if="createMenuOpen"
          class="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
        >
          <button
            type="button"
            class="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/60"
            @click="createSkill"
          >
            <span class="text-sm font-medium text-foreground">创建技能</span>
            <span class="text-xs text-muted-foreground">通过对话描述创建</span>
          </button>
          <button
            type="button"
            class="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/60"
            @click="openUploadDialog"
          >
            <span class="text-sm font-medium text-foreground">上传技能</span>
            <span class="text-xs text-muted-foreground">导入 .zip 或 .md 文件</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Search + categories -->
    <div class="flex shrink-0 flex-wrap items-center gap-3 px-6 py-4">
      <div class="relative min-w-[220px] flex-1 max-w-md">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="searchQuery" class="h-9 pl-9" placeholder="请输入技能名称查询" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          class="rounded-full border px-3 py-1 text-xs transition-colors"
          :class="
            activeCategory === category
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
          "
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>
    </div>

    <!-- Grid -->
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div
        v-if="skillsStore.loading"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <div
          v-for="i in 8"
          :key="`sk-${i}`"
          class="h-40 animate-pulse rounded-xl border border-border/60 bg-muted/30"
        />
      </div>

      <div
        v-else-if="filteredSkills.length === 0"
        class="flex h-48 flex-col items-center justify-center text-muted-foreground"
      >
        <Icon icon="lucide:wand-sparkles" class="mb-3 h-10 w-10 opacity-40" />
        <p class="text-sm">
          {{ searchQuery ? '未找到匹配的技能' : '暂无本地技能' }}
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <article
          v-for="skill in filteredSkills"
          :key="skill.name"
          class="flex cursor-pointer flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          @click="openDetail(skill)"
        >
          <div class="mb-3 flex items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Icon :icon="getSkillIcon(skill)" class="h-5 w-5" />
            </div>
            <h3 class="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {{ getSkillDisplayName(skill) }}
            </h3>
          </div>
          <p class="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
            {{ skill.description || '暂无描述' }}
          </p>
          <div class="flex justify-end" @click.stop>
            <Button v-if="isInstalled(skill)" size="sm" class="min-w-16" @click="handleUse(skill)">
              使用
            </Button>
            <Button
              v-else
              size="sm"
              variant="outline"
              class="min-w-16"
              @click="handleInstall(skill)"
            >
              安装
            </Button>
          </div>
        </article>
      </div>
    </div>

    <SkillUploadDialog v-model:open="uploadDialogOpen" @installed="onSkillUploaded" />
  </div>
</template>
