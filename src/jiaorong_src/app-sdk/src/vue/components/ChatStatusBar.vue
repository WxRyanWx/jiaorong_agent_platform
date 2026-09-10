<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'
import type {
  AgentToolItem,
  CatalogModel,
  PermissionMode,
  SessionContextOccupancy,
  SessionGenerationSettings,
  SessionGenerationSettingsPatch,
  SystemPromptOption,
  ToolMode
} from '../../types'
import ChatAdvancedSettings from './ChatAdvancedSettings.vue'
import dashscopeIcon from '../assets/dashscope.svg'
import duihuaIcon from '../assets/duihua.png'

const DEFAULT_PROVIDER_ID = 'jiaorong'
const DEFAULT_MODEL_ID = 'jiaorong-deepseek-v4-pro'
const REASONING_LABELS: Record<string, string> = {
  none: '关闭',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最大'
}
const REASONING_OPTIONS = [
  { value: '', label: '使用默认值' },
  { value: 'none', label: '关闭' },
  { value: 'minimal', label: '极低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'max', label: '最大' }
] as const

type ProviderIconKind = 'jiaorong' | 'dashscope' | 'other'

function providerIconKind(providerId: string): ProviderIconKind {
  const id = providerId.trim().toLowerCase()
  if (id === DEFAULT_PROVIDER_ID) return 'jiaorong'
  if (id === 'dashscope' || id.includes('alibaba')) return 'dashscope'
  return 'other'
}

const props = withDefaults(
  defineProps<{
    models?: CatalogModel[]
    providerId?: string
    modelId?: string
    permissionMode?: PermissionMode
    orchestration?: 'explicit' | 'proactive'
    occupancy?: SessionContextOccupancy | null
    systemPrompts?: readonly SystemPromptOption[]
    selectedSystemPromptId?: string
    toolMode?: ToolMode
    toolModeOverride?: ToolMode | null
    agentTools?: readonly AgentToolItem[]
    disabledToolNames?: readonly string[]
    toolsLoading?: boolean
    modelPicker?: boolean
    permissionPicker?: boolean
    orchestrationPicker?: boolean
    generationSettingsPicker?: boolean
    generationSettings?: SessionGenerationSettings | null
    disabled?: boolean
  }>(),
  {
    models: () => [],
    permissionMode: 'full_access',
    orchestration: 'explicit',
    occupancy: null,
    systemPrompts: () => [],
    selectedSystemPromptId: 'empty',
    toolMode: 'agent',
    toolModeOverride: null,
    agentTools: () => [],
    disabledToolNames: () => [],
    toolsLoading: false,
    modelPicker: true,
    permissionPicker: true,
    orchestrationPicker: true,
    generationSettingsPicker: true,
    disabled: false
  }
)

const emit = defineEmits<{
  'select-model': [payload: { providerId: string; modelId: string }]
  'select-permission': [mode: PermissionMode]
  'select-orchestration': [policy: 'explicit' | 'proactive']
  'update-generation-settings': [payload: SessionGenerationSettingsPatch]
  'select-system-prompt': [id: string]
  'select-tool-mode': [mode: ToolMode | null]
  'toggle-tool-group': [payload: { group: string; items: string[]; enabled: boolean }]
  'toggle-tool': [name: string]
  'open-settings': []
  'open-collab': []
  'open-models': []
}>()

const modelOpen = ref(false)
const permissionOpen = ref(false)
const collabOpen = ref(false)
const settingsOpen = ref(false)
const modelSearch = shallowRef('')
const rootEl = shallowRef<HTMLElement | null>(null)
const collaboration = computed(() => props.orchestration === 'proactive')
const fallbackModel = computed(() => {
  const selected = props.models.find(
    (item) => item.providerId === DEFAULT_PROVIDER_ID && item.modelId === DEFAULT_MODEL_ID
  )
  if (selected) return selected
  return (
    props.models.find((item) => item.providerId === DEFAULT_PROVIDER_ID) ?? props.models[0] ?? null
  )
})
const resolvedProviderId = computed(
  () => props.providerId?.trim() || fallbackModel.value?.providerId || DEFAULT_PROVIDER_ID
)
const resolvedModelId = computed(
  () => props.modelId?.trim() || fallbackModel.value?.modelId || DEFAULT_MODEL_ID
)
const displayModel = computed(() => resolvedModelId.value)
const triggerIconKind = computed(() => providerIconKind(resolvedProviderId.value))
const currentEffort = computed(() => props.generationSettings?.reasoningEffort ?? '')
const defaultValueLabel = computed(() => {
  const effort = currentEffort.value
  if (!effort) return '使用默认值'
  return REASONING_LABELS[effort] || effort
})
const visibleOccupancy = computed(() => {
  const snapshot = props.occupancy
  if (!snapshot || snapshot.freshness === 'unavailable') return null
  return snapshot
})
const occupancyRatio = computed(() => {
  const snapshot = visibleOccupancy.value
  if (!snapshot || snapshot.contextWindowTokens <= 0) return 0
  return snapshot.occupiedTokens / snapshot.contextWindowTokens
})
const occupancyPercent = computed(() => {
  const snapshot = visibleOccupancy.value
  if (!snapshot) return ''
  if (snapshot.freshness === 'stale') return '—'
  const percent = `${Math.max(0, Math.round(occupancyRatio.value * 100))}%`
  return snapshot.source === 'estimated' ? `≈${percent}` : percent
})
const occupancyFillWidth = computed(() =>
  visibleOccupancy.value?.freshness === 'stale'
    ? '0%'
    : `${Math.min(100, Math.max(0, occupancyRatio.value * 100))}%`
)
const occupancyFillClass = computed(() => {
  if (visibleOccupancy.value?.freshness === 'stale') return 'bg-muted-foreground/40'
  if (occupancyRatio.value >= 1) return 'bg-destructive'
  if (occupancyRatio.value >= 0.8) return 'bg-amber-500'
  return 'bg-primary/70'
})
const modes: Array<{
  value: PermissionMode
  label: string
  icon: string
  className: string
}> = [
  {
    value: 'default',
    label: '默认权限',
    icon: 'lucide:shield',
    className: 'text-muted-foreground'
  },
  {
    value: 'auto_approve',
    label: '助手代审',
    icon: 'lucide:shield-check',
    className: 'text-emerald-500'
  },
  {
    value: 'full_access',
    label: '完全访问',
    icon: 'lucide:shield-alert',
    className: 'text-orange-500'
  }
]
const currentMode = computed(
  () => modes.find((item) => item.value === props.permissionMode) ?? modes[2]
)
const groupedModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase()
  const groups = new Map<string, CatalogModel[]>()
  for (const model of props.models) {
    const haystack =
      `${model.providerId} ${model.providerName ?? ''} ${model.modelId} ${model.name}`.toLowerCase()
    if (query && !haystack.includes(query)) continue
    const list = groups.get(model.providerId) ?? []
    list.push(model)
    groups.set(model.providerId, list)
  }
  return [...groups.entries()].map(([providerId, models]) => ({
    providerId,
    providerName: models[0]?.providerName?.trim() || providerId,
    models
  }))
})

function closeAll() {
  modelOpen.value = false
  permissionOpen.value = false
  collabOpen.value = false
  settingsOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (rootEl.value && target && !rootEl.value.contains(target)) closeAll()
}

function selectModel(providerId: string, modelId: string) {
  emit('select-model', { providerId, modelId })
  modelOpen.value = false
  modelSearch.value = ''
}

function toggleModel() {
  modelOpen.value = !modelOpen.value
  permissionOpen.value = false
  collabOpen.value = false
  settingsOpen.value = false
  if (modelOpen.value) emit('open-models')
}

function toggleCollab() {
  collabOpen.value = !collabOpen.value
  modelOpen.value = false
  permissionOpen.value = false
  settingsOpen.value = false
  if (collabOpen.value) emit('open-collab')
}

function selectReasoningEffort(value: string) {
  emit('update-generation-settings', {
    reasoningEffort: (value || undefined) as SessionGenerationSettings['reasoningEffort']
  })
}

function togglePermission() {
  permissionOpen.value = !permissionOpen.value
  modelOpen.value = false
  collabOpen.value = false
  settingsOpen.value = false
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  modelOpen.value = false
  permissionOpen.value = false
  collabOpen.value = false
  if (settingsOpen.value) emit('open-settings')
}

function selectPermission(mode: PermissionMode) {
  emit('select-permission', mode)
  permissionOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <div ref="rootEl" class="flex w-full items-center justify-between px-1 py-2">
    <div class="relative flex min-w-0 items-center gap-1">
      <div v-if="modelPicker" class="relative min-w-0">
        <button
          type="button"
          data-testid="app-model-switcher"
          class="dc-blur-panel inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          :disabled="disabled"
          @click="toggleModel"
        >
          <img
            v-if="triggerIconKind === 'jiaorong'"
            :src="duihuaIcon"
            alt=""
            class="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
          />
          <img
            v-else-if="triggerIconKind === 'dashscope'"
            :src="dashscopeIcon"
            alt=""
            class="h-3.5 w-3.5 shrink-0"
          />
          <Icon v-else icon="lucide:cpu" class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{{ displayModel }}</span>
          <Icon icon="lucide:chevron-down" class="h-3 w-3 shrink-0" />
        </button>
        <div
          v-if="modelOpen"
          class="absolute bottom-full left-0 z-20 mb-1 w-[20rem] overflow-hidden rounded-md border border-border bg-background shadow-md"
        >
          <div class="border-b px-2.5 py-2">
            <input
              v-model="modelSearch"
              type="search"
              placeholder="搜索模型..."
              class="h-7 w-full bg-transparent px-3 text-xs outline-none"
            />
          </div>
          <div class="max-h-[24rem] overflow-y-auto px-2 py-2">
            <div
              v-if="groupedModels.length === 0"
              class="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
            >
              暂无可用模型
            </div>
            <div v-else class="space-y-3">
              <div v-for="group in groupedModels" :key="group.providerId" class="space-y-1">
                <div
                  class="px-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
                >
                  {{ group.providerName }}
                </div>
                <button
                  v-for="model in group.models"
                  :key="`${group.providerId}-${model.modelId}`"
                  type="button"
                  data-testid="model-option"
                  class="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs"
                  :class="
                    resolvedProviderId === group.providerId && resolvedModelId === model.modelId
                      ? 'bg-muted/60 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  "
                  @click="selectModel(group.providerId, model.modelId)"
                >
                  <img
                    v-if="providerIconKind(group.providerId) === 'jiaorong'"
                    :src="duihuaIcon"
                    alt=""
                    class="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                  />
                  <img
                    v-else-if="providerIconKind(group.providerId) === 'dashscope'"
                    :src="dashscopeIcon"
                    alt=""
                    class="h-3.5 w-3.5 shrink-0"
                  />
                  <Icon v-else icon="lucide:cpu" class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate font-medium">{{ model.modelId }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="orchestrationPicker" class="relative">
        <button
          type="button"
          data-testid="orchestration-control"
          class="dc-blur-panel inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs"
          :class="
            collaboration
              ? 'bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/30 ring-inset'
              : 'text-muted-foreground hover:text-foreground'
          "
          :disabled="disabled"
          :aria-pressed="collaboration"
          @click="toggleCollab"
        >
          <Icon v-if="collaboration" icon="lucide:git-fork" class="h-3.5 w-3.5" />
          <span>{{ defaultValueLabel }}</span>
          <Icon icon="lucide:chevron-down" class="h-3 w-3" />
        </button>
        <div
          v-if="collabOpen"
          class="absolute bottom-full left-0 z-20 mb-1 w-[19rem] overflow-hidden rounded-md border border-border bg-background shadow-md"
        >
          <div class="px-2 py-2">
            <div class="px-2 pb-1 text-[11px] font-medium text-muted-foreground">推理力度</div>
            <div class="space-y-0.5">
              <button
                v-for="option in REASONING_OPTIONS"
                :key="option.value || 'default'"
                type="button"
                class="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                :class="
                  currentEffort === option.value
                    ? 'bg-muted/60 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                "
                @click="selectReasoningEffort(option.value)"
              >
                <span class="flex-1">{{ option.label }}</span>
                <Icon
                  v-if="currentEffort === option.value"
                  icon="lucide:check"
                  class="h-3.5 w-3.5"
                />
              </button>
            </div>
          </div>
          <div class="border-t px-3 py-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <Icon icon="lucide:git-fork" class="h-4 w-4 shrink-0" />
                <span class="text-sm font-medium">主动协作</span>
              </div>
              <button
                type="button"
                data-testid="proactive-collaboration-toggle"
                role="switch"
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                :class="collaboration ? 'bg-violet-500' : 'bg-muted'"
                :aria-checked="collaboration"
                @click="emit('select-orchestration', collaboration ? 'explicit' : 'proactive')"
              >
                <span
                  class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                  :class="collaboration ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
            <p class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              允许主 Agent 在独立或并行工作明显有帮助时主动委派；可能消耗更多时间、Token
              和系统资源。
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <div
        v-if="visibleOccupancy"
        data-testid="context-occupancy"
        :data-freshness="visibleOccupancy.freshness"
        :data-source="visibleOccupancy.source"
        class="dc-blur-panel flex h-6 items-center gap-1.5 px-2 text-xs text-muted-foreground"
      >
        <Icon icon="lucide:gauge" class="h-3.5 w-3.5 shrink-0" />
        <span class="h-1 w-8 overflow-hidden rounded-full bg-muted">
          <span
            :class="['block h-full rounded-full', occupancyFillClass]"
            :style="{ width: occupancyFillWidth }"
          />
        </span>
        <span class="tabular-nums">{{ occupancyPercent }}</span>
        <Icon
          v-if="visibleOccupancy.freshness === 'stale'"
          icon="lucide:clock-3"
          class="h-3 w-3 shrink-0 opacity-70"
        />
      </div>
      <div v-if="generationSettingsPicker" class="relative shrink-0">
        <button
          type="button"
          data-testid="generation-settings"
          class="dc-blur-panel inline-flex h-6 w-6 items-center justify-center rounded-md text-xs text-muted-foreground hover:text-foreground"
          :disabled="disabled"
          title="高级配置"
          aria-label="高级配置"
          @click="toggleSettings"
        >
          <Icon icon="lucide:sliders-horizontal" class="h-3.5 w-3.5" />
        </button>
        <div v-if="settingsOpen" class="absolute right-0 bottom-full z-30 mb-1">
          <ChatAdvancedSettings
            :system-prompts="systemPrompts"
            :selected-system-prompt-id="selectedSystemPromptId"
            :generation-settings="generationSettings"
            :model-id="resolvedModelId"
            :tool-mode="toolMode"
            :tool-mode-override="toolModeOverride"
            :agent-tools="agentTools"
            :disabled-tool-names="disabledToolNames"
            :tools-loading="toolsLoading"
            :disabled="disabled"
            @select-system-prompt="emit('select-system-prompt', $event)"
            @update-generation-settings="emit('update-generation-settings', $event)"
            @select-tool-mode="emit('select-tool-mode', $event)"
            @toggle-tool-group="emit('toggle-tool-group', $event)"
            @toggle-tool="emit('toggle-tool', $event)"
          />
        </div>
      </div>
      <div v-if="permissionPicker" class="relative">
        <button
          type="button"
          class="dc-blur-panel inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs hover:text-orange-600"
          :class="currentMode.className"
          :disabled="disabled"
          @click="togglePermission"
        >
          <Icon :icon="currentMode.icon" class="h-3.5 w-3.5" />
          <span>{{ currentMode.label }}</span>
          <Icon icon="lucide:chevron-down" class="h-3 w-3" />
        </button>
        <div
          v-if="permissionOpen"
          class="absolute right-0 bottom-full z-20 mb-1 min-w-48 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md"
        >
          <button
            v-for="mode in modes"
            :key="mode.value"
            type="button"
            class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
            @click="selectPermission(mode.value)"
          >
            <Icon :icon="mode.icon" class="h-3.5 w-3.5 shrink-0" :class="mode.className" />
            <span class="flex-1">{{ mode.label }}</span>
            <Icon v-if="permissionMode === mode.value" icon="lucide:check" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
