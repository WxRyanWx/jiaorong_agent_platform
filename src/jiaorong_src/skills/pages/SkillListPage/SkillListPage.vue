<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  isSkillVisibleInMarket,
  loadRemoteInstallMap,
  pruneRemoteInstallMap,
  rememberRemoteInstall,
  rememberSkillSource,
  saveJiaorongSkillToSession,
  SkillSource,
  toJiaorongSkillItem
} from '../../lib/sessionSkill'
import { formatSkillInstallError } from '../../lib/formatSkillInstallError'
import {
  SKILL_CATEGORY_ALL,
  SKILL_CATEGORY_ALL_ID,
  buildFilterCategoryTabs,
  skillMatchesCategoryFilter,
  type SkillCategory
} from '../../lib/skillCategories'
import {
  JIAORONG_DEFAULT_SKILL_INSTALL_EVENT,
  getDefaultSkillsInstallingNames,
  type DefaultSkillInstallEventDetail
} from '../../lib/defaultSkillInstallEvents'
import { parseSkillMarketTab, type SkillMarketTab } from '../../lib/skillMarketTab'
import SkillUploadDialog from '../../components/SkillUploadDialog/SkillUploadDialog.vue'
import './index.less'

const router = useRouter()
const route = useRoute()
const skillsStore = useSkillsStore()
const { toast } = useToast()

const activeTab = ref<SkillMarketTab>(parseSkillMarketTab(route.query.tab))
const searchQuery = ref('')

function setActiveTab(tab: SkillMarketTab) {
  activeTab.value = tab
  if (parseSkillMarketTab(route.query.tab) === tab) return
  void router.replace({
    name: 'skills',
    query: { ...route.query, tab }
  })
}
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
/** 远程列表失败时有值；本地仍可能有数据 */
const catalogRemoteError = ref('')
/** 正在安装的技能 name */
const installingNames = ref(new Set<string>())
/** 远程卡片 name → 安装后本地技能名（zip 目录名可能与展示名不同） */
const remoteInstalledLocalNames = ref<Record<string, string>>(loadRemoteInstallMap())

let loadGeneration = 0
let defaultInstallEventHandler: ((event: Event) => void) | null = null

function getDownloadUrl(skill: SkillMetadata): string {
  const url = skill.metadata?.downloadUrl
  return typeof url === 'string' ? url.trim() : ''
}

function getInstalledLocalName(skill: SkillMetadata): string {
  const fromMap = remoteInstalledLocalNames.value[skill.name]
  if (fromMap) return fromMap
  const fromMeta = skill.metadata?.installedSkillName
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim()
  return skill.name
}

/**
 * 隐藏「已被市场卡关联」的本地 slug 重复卡。
 * 仅依据 name / remoteInstallMap / installedSkillName，不看 displayName。
 * map 项仅当对应市场卡仍在当前列表中时才吸收，避免远程下架后本地卡被误藏。
 */
function hideLocalSlugDuplicatedByRemoteInstall(
  skills: SkillMetadata[],
  marketToLocal: Record<string, string>
): SkillMetadata[] {
  const presentNames = new Set(skills.map((s) => s.name))
  const absorbedLocalNames = new Set<string>()
  for (const skill of skills) {
    const installed = skill.metadata?.installedSkillName
    if (typeof installed === 'string' && installed.trim() && installed !== skill.name) {
      absorbedLocalNames.add(installed.trim())
    }
  }
  for (const [marketName, localName] of Object.entries(marketToLocal)) {
    const local = localName.trim()
    const market = marketName.trim()
    if (!local || !market || local === market) continue
    if (!presentNames.has(market)) continue
    absorbedLocalNames.add(local)
  }

  return skills.filter((skill) => !absorbedLocalNames.has(skill.name))
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
  catalogRemoteError.value = ''
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

    catalogRemoteError.value = catalog.remoteError ?? ''
    if (catalog.remoteError) {
      toast({
        title: '技能市场加载失败',
        description: catalog.remoteError || '请稍后重试',
        variant: 'destructive'
      })
    }

    const { local, merged } = catalog
    // 磁盘上手删后 map 会过期：只保留扫盘仍存在的本地名
    remoteInstalledLocalNames.value = pruneRemoteInstallMap(local.map((item) => item.name))
    // 远程已装但目录名与市场 name 不一致时，凭 remoteInstallMap 把本地挂到市场卡，并隐藏本地 slug 卡
    const enriched = merged.map((skill) => {
      const localName = remoteInstalledLocalNames.value[skill.name]
      if (!localName) return skill
      const localMeta = local.find((item) => item.name === localName)
      if (!localMeta) {
        return skill
      }
      return {
        ...localMeta,
        // 卡片身份保持市场 name（唯一键）；调用技能仍用 installedSkillName / 本地目录名
        name: skill.name,
        // 接口 desc 优先，没有再用本地文档 description
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
    await skillsStore.ensureSkillsLoaded()
  } catch (e) {
    if (generation !== loadGeneration) return
    console.error('[SkillListPage] Failed to load skill market:', e)
    catalogRemoteError.value =
      e instanceof Error && e.message.trim() ? e.message.trim() : '技能市场加载失败'
    toast({
      title: '技能市场加载失败',
      description: catalogRemoteError.value,
      variant: 'destructive'
    })
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

/** 本地已发现（含远程安装后挂到市场卡的 skillRoot） */
function isInstalled(skill: SkillMetadata): boolean {
  return Boolean(skill.skillRoot)
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
    // 市场：仅远程接口 + 系统内置；上传/自建只在「已安装」
    if (activeTab.value === 'market' && !isSkillVisibleInMarket(skill)) {
      return false
    }
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

const marketCount = computed(
  () => skillItems.value.filter((skill) => isSkillVisibleInMarket(skill)).length
)

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
    params: { skillId: isInstalled(skill) ? localName : skill.name },
    query: { tab: activeTab.value }
  })
}

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = parseSkillMarketTab(tab)
  }
)

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
    const result = await installSkillFromZipUrl(downloadUrl, {
      displayName: getSkillDisplayName(skill)
    })
    if (!result.success || !result.skillName) {
      toast({
        title: '安装失败',
        description: formatSkillInstallError(result.error || '未知错误', 'remote'),
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
  // 合并默认技能静默安装中的「安装中」态
  for (const name of getDefaultSkillsInstallingNames()) {
    installingNames.value.add(name)
  }
  installingNames.value = new Set(installingNames.value)

  defaultInstallEventHandler = (event: Event) => {
    const detail = (event as CustomEvent<DefaultSkillInstallEventDetail>).detail
    if (!detail?.marketName) return
    const next = new Set(installingNames.value)
    if (detail.phase === 'start') {
      next.add(detail.marketName)
      installingNames.value = next
      return
    }
    next.delete(detail.marketName)
    installingNames.value = next
    // 以默认安装队列为准（勿用 next.size：可能还含用户手动安装项）
    if (getDefaultSkillsInstallingNames().length === 0) {
      remoteInstalledLocalNames.value = loadRemoteInstallMap()
      void refreshMarket()
    }
  }
  window.addEventListener(JIAORONG_DEFAULT_SKILL_INSTALL_EVENT, defaultInstallEventHandler)

  // 进入技能中心再兜底检测一次（构建号未变则立刻 skip）
  void import('../../lib/ensureDefaultSkills')
    .then(({ scheduleEnsureDefaultSkills }) => {
      scheduleEnsureDefaultSkills({ authWaitMs: 0 })
    })
    .catch(() => undefined)

  void refreshMarket()
})

onUnmounted(() => {
  // 作废进行中的请求，避免离开页面后回写
  loadGeneration += 1
  if (defaultInstallEventHandler) {
    window.removeEventListener(JIAORONG_DEFAULT_SKILL_INSTALL_EVENT, defaultInstallEventHandler)
    defaultInstallEventHandler = null
  }
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
          @click.stop="setActiveTab('market')"
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
          @click.stop="setActiveTab('installed')"
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
        <span class="skill-center-page__state-spinner" aria-hidden="true">
          <Icon icon="lucide:loader-2" class="skill-center-page__state-icon" />
        </span>
        <p class="skill-center-page__state-text">加载技能中…</p>
      </div>

      <div
        v-else-if="filteredSkills.length === 0"
        class="skill-center-page__state skill-center-page__state--empty"
      >
        <img :src="skillLogo" alt="" class="skill-center-page__state-logo" />
        <p class="skill-center-page__state-text">
          {{
            searchQuery
              ? '未找到匹配的技能'
              : catalogRemoteError && activeTab === 'market'
                ? '技能市场加载失败，请稍后重试'
                : '暂无技能'
          }}
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
