<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Input } from '@shadcn/components/ui/input'
import { useSkillsStore } from '@/stores/skillsStore'
import type { SkillMetadata } from '@shared/types/skill'
import { fetchSkillMarketCatalog, listSkillCategories } from '@jiaorong/api/skills'
import {
  installSkillFromZipUrl,
  isSkillSwitchOn,
  startGeneralChatWithSkills
} from '@jiaorong/utils'
import skillLogo from '@jiaorong/assets/skill.png'
import { useToast } from '@/components/use-toast'
import {
  BUILTIN_SKILL_NAMES,
  type JiaorongSkillItem,
  getRememberedSkillSource,
  loadRemoteInstallMap,
  rememberRemoteInstall,
  rememberSkillSource,
  saveJiaorongSkillToSession,
  SkillSource,
  toJiaorongSkillItem
} from '../../lib/sessionSkill'
import {
  SKILL_CATEGORY_ALL,
  SKILL_CATEGORY_ALL_ID,
  buildFilterCategoryTabs,
  skillMatchesCategoryFilter,
  type SkillCategory
} from '../../lib/skillCategories'
import SkillUploadDialog from '../../components/SkillUploadDialog/SkillUploadDialog.vue'
import './index.less'

type MarketTab = 'market' | 'installed'

const router = useRouter()
const skillsStore = useSkillsStore()
const { toast } = useToast()

const activeTab = ref<MarketTab>('market')
const searchQuery = ref('')
/** 当前选中分类 id；空字符串表示「全部」 */
const activeCategoryId = ref(SKILL_CATEGORY_ALL_ID)
/** 接口分类 +「全部」；失败时仅「全部」 */
const categories = ref<SkillCategory[]>([
  { id: SKILL_CATEGORY_ALL_ID, categoryName: SKILL_CATEGORY_ALL }
])
const createMenuOpen = ref(false)
const uploadDialogOpen = ref(false)
/** 市场列表（远程 + 本地合并结果） */
const catalogSkills = ref<SkillMetadata[]>([])
const catalogLoading = ref(false)
/** 正在安装的技能 name */
const installingNames = ref(new Set<string>())
/** 远程卡片 name → 安装后本地技能名（zip 目录名可能与展示名不同） */
const remoteInstalledLocalNames = ref<Record<string, string>>(loadRemoteInstallMap())

let loadGeneration = 0

function getDownloadUrl(skill: SkillMetadata): string {
  const url = skill.metadata?.downloadUrl
  return typeof url === 'string' ? url.trim() : ''
}

function getInstalledLocalName(skill: SkillMetadata): string {
  return remoteInstalledLocalNames.value[skill.name] || skill.name
}

/**
 * 远程展示名与 zip 目录名不一致时，本地扫盘还会多出一条 slug 卡。
 * 已由 remoteInstallMap 挂到市场卡上的本地名不再单独展示。
 */
function hideLocalSlugDuplicatedByRemoteInstall(
  skills: SkillMetadata[],
  marketToLocal: Record<string, string>
): SkillMetadata[] {
  const claimedLocalNames = new Set(Object.values(marketToLocal))
  return skills.filter((skill) => {
    if (!claimedLocalNames.has(skill.name)) return true
    // 市场展示名恰好等于本地名时，这条就是市场卡本身，保留
    if (skill.name in marketToLocal) return true
    return false
  })
}

/** 仅更新单个远程技能为已安装，避免整表刷新 */
function markRemoteSkillInstalled(marketName: string, localSkillName: string) {
  rememberRemoteInstall(marketName, localSkillName)
  remoteInstalledLocalNames.value = {
    ...remoteInstalledLocalNames.value,
    [marketName]: localSkillName
  }

  const updated = catalogSkills.value.map((item) => {
    if (item.name !== marketName) return item
    return {
      ...item,
      skillRoot: item.skillRoot || localSkillName,
      metadata: {
        ...item.metadata,
        installedSkillName: localSkillName,
        displayName:
          (typeof item.metadata?.displayName === 'string' && item.metadata.displayName) || item.name
      }
    }
  })
  catalogSkills.value = hideLocalSlugDuplicatedByRemoteInstall(
    updated,
    remoteInstalledLocalNames.value
  )
}

/** 进入页面 / 上传成功后刷新列表与分类 */
async function refreshMarket() {
  const generation = ++loadGeneration
  catalogLoading.value = true
  // 详情页卸载可能已清 localStorage，回到列表时同步内存映射
  remoteInstalledLocalNames.value = loadRemoteInstallMap()

  // 分类与列表解耦：列表失败时仍尽量刷新 pill
  const categoryPromise = listSkillCategories().catch((e) => {
    console.error('[SkillListPage] Failed to load skill categories:', e)
    return [] as SkillCategory[]
  })

  try {
    const catalog = await fetchSkillMarketCatalog()
    if (generation !== loadGeneration) return

    const { local, merged } = catalog
    // 远程已装但目录名与展示名不一致时，把本地元数据挂回远程卡片
    const enriched = merged.map((skill) => {
      const localName = remoteInstalledLocalNames.value[skill.name]
      if (!localName) return skill
      const localMeta = local.find((item) => item.name === localName)
      if (!localMeta) {
        return {
          ...skill,
          skillRoot: skill.skillRoot || localName,
          metadata: {
            ...skill.metadata,
            installedSkillName: localName
          }
        }
      }
      return {
        ...localMeta,
        // 必须保留市场展示名，否则去重会把「已被 map 的 slug」连同这张市场卡一起滤掉
        name: skill.name,
        description: skill.description || localMeta.description,
        path: localMeta.path,
        skillRoot: localMeta.skillRoot,
        category: skill.category ?? localMeta.category,
        metadata: {
          ...localMeta.metadata,
          ...skill.metadata,
          displayName:
            (typeof skill.metadata?.displayName === 'string' && skill.metadata.displayName) ||
            skill.name,
          installedSkillName: localName,
          // 显式钉住远程字段，避免被本地 frontmatter 冲掉
          ...(typeof skill.metadata?.remoteId === 'string' && skill.metadata.remoteId.trim()
            ? { remoteId: skill.metadata.remoteId }
            : {}),
          ...(typeof skill.metadata?.downloadUrl === 'string' && skill.metadata.downloadUrl.trim()
            ? { downloadUrl: skill.metadata.downloadUrl }
            : {}),
          ...(typeof skill.metadata?.categoryId === 'string' && skill.metadata.categoryId.trim()
            ? { categoryId: skill.metadata.categoryId.trim() }
            : {})
        }
      }
    })
    catalogSkills.value = hideLocalSlugDuplicatedByRemoteInstall(
      enriched,
      remoteInstalledLocalNames.value
    )
    skillsStore.skills = local
  } catch (e) {
    if (generation !== loadGeneration) return
    console.error('[SkillListPage] Failed to load skill market:', e)
  } finally {
    if (generation === loadGeneration) {
      const categoryList = await categoryPromise
      if (generation === loadGeneration) {
        const nextTabs = buildFilterCategoryTabs(categoryList)
        categories.value = nextTabs
        if (!nextTabs.some((item) => item.id === activeCategoryId.value)) {
          activeCategoryId.value = SKILL_CATEGORY_ALL_ID
        }
        catalogLoading.value = false
      }
    }
  }
}

function getSkillDisplayName(skill: SkillMetadata): string {
  const displayName = skill.metadata?.displayName
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim()
  }
  return skill.name
}

/** 本地已发现，或本页刚装过的远程技能 */
function isInstalled(skill: SkillMetadata): boolean {
  return Boolean(skill.skillRoot) || Boolean(remoteInstalledLocalNames.value[skill.name])
}

function isInstalling(skill: SkillMetadata): boolean {
  return installingNames.value.has(skill.name)
}

function isSkillDisabled(skill: SkillMetadata): boolean {
  return isInstalled(skill) && !isSkillSwitchOn(getInstalledLocalName(skill))
}

const skillItems = computed((): JiaorongSkillItem[] =>
  catalogSkills.value.map((skill) => {
    const item = toJiaorongSkillItem(skill)
    // 无本地根目录的为远程未安装条目（勿被 resolveSkillSource 默认成 Zip）
    if (!skill.skillRoot) {
      return { ...item, skill_source: SkillSource.RemoteApi }
    }
    return item
  })
)

const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return skillItems.value.filter((skill) => {
    if (activeTab.value === 'installed' && !isInstalled(skill)) {
      return false
    }
    if (!skillMatchesCategoryFilter(skill, activeCategoryId.value)) {
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

const installedCount = computed(() => skillItems.value.filter((skill) => isInstalled(skill)).length)

const marketCount = computed(() => skillItems.value.length)

const openDetail = (skill: JiaorongSkillItem) => {
  // 安装中不允许进入详情，避免中断安装或读到半成品状态
  if (isInstalling(skill)) return

  const localName = getInstalledLocalName(skill)
  const isRemoteCard =
    skill.skill_source === SkillSource.RemoteApi ||
    Boolean(skill.metadata?.remoteId) ||
    Boolean(remoteInstalledLocalNames.value[skill.name])

  // 远程字段（含 remoteId）写入 session，详情页按 remoteId 拉接口
  saveJiaorongSkillToSession({
    ...skill,
    name: isInstalled(skill) ? localName : skill.name,
    skill_source: isRemoteCard ? SkillSource.RemoteApi : skill.skill_source,
    metadata: {
      ...skill.metadata,
      displayName: getSkillDisplayName(skill),
      ...(isInstalled(skill) ? { installedSkillName: localName } : {})
    }
  })
  void router.push({
    name: 'skills-detail',
    params: { skillId: isInstalled(skill) ? localName : skill.name }
  })
}

const handleUse = async (skill: JiaorongSkillItem) => {
  const localName = getInstalledLocalName(skill)
  const isRemoteCard =
    skill.skill_source === SkillSource.RemoteApi ||
    Boolean(skill.metadata?.remoteId) ||
    Boolean(remoteInstalledLocalNames.value[skill.name])

  // 远程字段 + 安装后本地路径等一并写入，详情页直接读存储
  saveJiaorongSkillToSession({
    ...skill,
    name: localName,
    skill_source: isRemoteCard ? SkillSource.RemoteApi : skill.skill_source,
    metadata: {
      ...skill.metadata,
      displayName: getSkillDisplayName(skill),
      installedSkillName: localName
    }
  })
  await startGeneralChatWithSkills({
    router,
    prompt: '',
    skillNames: [localName]
  })
}

const handleInstall = async (skill: JiaorongSkillItem) => {
  const downloadUrl = getDownloadUrl(skill)
  if (!downloadUrl) {
    toast({
      title: '安装失败',
      description: '缺少下载地址',
      variant: 'destructive'
    })
    return
  }
  if (isInstalling(skill)) return

  const next = new Set(installingNames.value)
  next.add(skill.name)
  installingNames.value = next

  try {
    const result = await installSkillFromZipUrl(downloadUrl)
    if (!result.success || !result.skillName) {
      toast({
        title: '安装失败',
        description: result.error || '未知错误',
        variant: 'destructive'
      })
      return
    }
    rememberSkillSource(result.skillName, SkillSource.RemoteApi)
    markRemoteSkillInstalled(skill.name, result.skillName)
  } finally {
    const done = new Set(installingNames.value)
    done.delete(skill.name)
    installingNames.value = done
  }
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
  void refreshMarket()
}

onMounted(() => {
  for (const name of BUILTIN_SKILL_NAMES) {
    if (getRememberedSkillSource(name) == null) {
      rememberSkillSource(name, SkillSource.LocalBuiltin)
    }
  }
  void refreshMarket()
})

onUnmounted(() => {
  // 作废进行中的请求，避免离开页面后回写
  loadGeneration += 1
})
</script>

<template>
  <div class="skill-center-page" @click="closeCreateMenu">
    <!-- Header: tabs + create -->
    <div class="skill-center-page__header">
      <div class="skill-center-page__tabs">
        <button
          type="button"
          class="skill-center-page__tab"
          :class="{ 'is-active': activeTab === 'market' }"
          @click.stop="activeTab = 'market'"
        >
          技能市场
          <span class="skill-center-page__tab_span">
            {{ marketCount }}
          </span>
        </button>
        <button
          type="button"
          class="skill-center-page__tab"
          :class="{ 'is-active': activeTab === 'installed' }"
          @click.stop="activeTab = 'installed'"
        >
          已安装
          <span class="skill-center-page__tab_span">
            {{ installedCount }}
          </span>
        </button>
      </div>

      <div class="skill-center-page__create-wrap" @click.stop>
        <Button size="sm" class="skill-center-page__create-btn" @click="toggleCreateMenu">
          <Icon icon="lucide:plus" class="skill-center-page__create-icon" />
          新建技能
        </Button>
        <div v-if="createMenuOpen" class="skill-center-page__create-menu">
          <button type="button" class="skill-center-page__create-menu-item" @click="createSkill">
            <span class="skill-center-page__create-menu-title">创建技能</span>
            <span class="skill-center-page__create-menu-desc">通过对话描述创建</span>
          </button>
          <button
            type="button"
            class="skill-center-page__create-menu-item"
            @click="openUploadDialog"
          >
            <span class="skill-center-page__create-menu-title">上传技能</span>
            <span class="skill-center-page__create-menu-desc">导入 zip 或 md 文件</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Search + categories -->
    <div class="skill-center-page__toolbar">
      <div class="skill-center-page__search">
        <Icon icon="lucide:search" class="skill-center-page__search-icon" />
        <Input
          v-model="searchQuery"
          class="skill-center-page__search-input"
          placeholder="请输入技能名称或描述"
        />
      </div>
      <div class="skill-center-page__categories">
        <button
          v-for="category in categories"
          :key="category.id || 'all'"
          type="button"
          class="skill-center-page__category"
          :class="{ 'is-active': activeCategoryId === category.id }"
          @click="activeCategoryId = category.id"
        >
          {{ category.categoryName }}
        </button>
      </div>
    </div>

    <!-- Grid -->
    <div class="skill-center-page__content">
      <div v-if="catalogLoading" class="skill-center-page__state">
        <Icon icon="lucide:loader-2" class="skill-center-page__state-icon" />
        <p class="skill-center-page__state-text">加载技能中…</p>
      </div>

      <div
        v-else-if="filteredSkills.length === 0"
        class="skill-center-page__state skill-center-page__state--empty"
      >
        <img :src="skillLogo" alt="" class="skill-center-page__state-logo" />
        <p class="skill-center-page__state-text">
          {{ searchQuery ? '未找到匹配的技能' : '暂无技能' }}
        </p>
      </div>

      <div v-else class="skill-center-page__grid">
        <article
          v-for="skill in filteredSkills"
          :key="skill.name"
          class="skill-center-page__card"
          :class="{ 'is-installing': isInstalling(skill) }"
          @click="openDetail(skill)"
        >
          <div class="skill-center-page__card-head">
            <img :src="skillLogo" alt="" class="skill-center-page__card-logo" />
            <h3 class="skill-center-page__card-title">
              {{ getSkillDisplayName(skill) }}
            </h3>
          </div>
          <p class="skill-center-page__card-desc">
            {{ skill.description || '暂无描述' }}
          </p>
          <div class="skill-center-page__card-actions" @click.stop>
            <template v-if="isInstalled(skill)">
              <Button
                size="sm"
                variant="outline"
                v-if="isSkillDisabled(skill)"
                class="skill-center-page__disabled-label"
              >
                已停用
              </Button>
              <Button
                v-else
                size="sm"
                class="skill-center-page__action-btn"
                @click="handleUse(skill)"
              >
                使用
              </Button>
            </template>
            <Button
              v-else
              size="sm"
              variant="outline"
              class="skill-center-page__action-btn"
              :disabled="isInstalling(skill)"
              @click="handleInstall(skill)"
            >
              {{ isInstalling(skill) ? '安装中' : '安装' }}
            </Button>
          </div>
        </article>
      </div>
    </div>

    <SkillUploadDialog v-model:open="uploadDialogOpen" @installed="onSkillUploaded" />
  </div>
</template>
