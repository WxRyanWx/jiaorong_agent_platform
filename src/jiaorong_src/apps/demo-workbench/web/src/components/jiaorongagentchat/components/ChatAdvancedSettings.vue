<!--
  高级配置弹层：系统提示词、模型生成参数、工具模式与内置工具开关。
  主要 props：systemPrompts、selectedSystemPromptId、generationSettings、modelId、
  toolMode、toolModeOverride、agentTools、disabledToolNames、toolsLoading、disabled。
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type {
  AgentToolItem,
  SessionGenerationSettings,
  SessionGenerationSettingsPatch,
  SystemPromptOption,
  ToolMode
} from 'jiaorong-app-sdk'
import {
  groupAgentTools,
  isGroupEnabled,
  TOOL_MODES,
  toolModeDescription,
  toolModeLabel
} from '../lib/agentTools'
import ChatGenerationSettings from './ChatGenerationSettings.vue'

/** 高级配置入参，供提示词 / 生成参数 / 工具开关读取 */
const props = withDefaults(
  defineProps<{
    /** 可选系统提示词列表 */
    systemPrompts?: readonly SystemPromptOption[]
    /** 当前选中的提示词 id */
    selectedSystemPromptId?: string
    /** 当前生成参数 */
    generationSettings?: SessionGenerationSettings | null
    /** 当前模型 id，展示在模型设置摘要里 */
    modelId?: string
    /** 实际生效的工具模式 */
    toolMode?: ToolMode
    /** 用户覆盖值；null 表示跟模型默认 */
    toolModeOverride?: ToolMode | null
    /** 可开关的内置工具 */
    agentTools?: readonly AgentToolItem[]
    /** 已禁用的工具名 */
    disabledToolNames?: readonly string[]
    /** 工具列表加载中 */
    toolsLoading?: boolean
    /** 禁用全部控件 */
    disabled?: boolean
  }>(),
  {
    systemPrompts: () => [],
    selectedSystemPromptId: 'empty',
    toolMode: 'agent',
    toolModeOverride: null,
    agentTools: () => [],
    disabledToolNames: () => [],
    toolsLoading: false
  }
)

/** 向父级抛出的高级配置变更，字段含义见下方 */
const emit = defineEmits<{
  /** 选中系统提示词 id */
  'select-system-prompt': [id: string]
  /** 写入模型生成参数补丁 */
  'update-generation-settings': [payload: SessionGenerationSettingsPatch]
  /** 选中工具模式；null 表示恢复模型默认 */
  'select-tool-mode': [mode: ToolMode | null]
  /** 整组开关内置工具 */
  'toggle-tool-group': [payload: { group: string; items: string[]; enabled: boolean }]
  /** 开关单个工具，参数为工具名 */
  'toggle-tool': [name: string]
}>()

/** 模型设置折叠是否展开 */
const generationOpen = ref(false)
/** 下拉选项：保证有「空提示词」，自定义提示词存在时再补一项 */
const promptOptions = computed(() => {
  const empty = { id: 'empty', name: '空提示词', content: '' }
  const listed = props.systemPrompts.some((item) => item.id === 'empty')
    ? [...props.systemPrompts]
    : [empty, ...props.systemPrompts]
  if (
    props.selectedSystemPromptId === '__custom__' &&
    !listed.some((item) => item.id === '__custom__')
  ) {
    listed.push({ id: '__custom__', name: '当前自定义提示词', content: '' })
  }
  return listed
})
/** 按分组整理后的工具列表 */
const toolGroups = computed(() => groupAgentTools(props.agentTools))
</script>

<template>
  <div class="w-80 overflow-hidden rounded-md border border-border bg-background shadow-md">
    <!-- 弹层标题 -->
    <div class="flex items-center justify-between gap-2 border-b px-3 py-3">
      <div class="text-sm font-medium">高级配置</div>
      <Icon icon="lucide:settings-2" class="h-3.5 w-3.5 text-muted-foreground" />
    </div>
    <div class="max-h-[24rem] overflow-y-auto">
      <!-- 系统提示词 -->
      <div class="border-b px-3 py-3">
        <div class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          系统提示词
        </div>
        <select
          class="mt-3 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
          :disabled="disabled"
          :value="selectedSystemPromptId"
          @change="emit('select-system-prompt', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in promptOptions" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>
      </div>

      <!-- 模型设置折叠 -->
      <div class="border-b">
        <button
          type="button"
          data-testid="generation-settings-trigger"
          class="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
          @click="generationOpen = !generationOpen"
        >
          <Icon icon="lucide:sliders-horizontal" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium">模型设置</span>
            <span class="block truncate text-[11px] text-muted-foreground">
              {{ modelId || 'Jiaorong' }}
            </span>
          </span>
          <Icon
            icon="lucide:chevron-down"
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="generationOpen ? 'rotate-180' : ''"
          />
        </button>
        <div v-if="generationOpen" class="space-y-4 px-3 pt-1 pb-3">
          <ChatGenerationSettings
            :settings="generationSettings"
            :disabled="disabled"
            @change="emit('update-generation-settings', $event)"
          />
        </div>
      </div>

      <!-- 工具模式 -->
      <div class="border-b px-3 py-3" data-testid="tool-mode-section">
        <div
          class="mb-3 flex items-center justify-between text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
        >
          <span>模式</span>
          <span v-if="toolModeOverride === null" class="normal-case tracking-normal">
            模型默认
          </span>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="mode in TOOL_MODES"
            :key="mode"
            type="button"
            class="flex h-8 min-w-0 items-center justify-center rounded-md border px-2 text-xs"
            :class="
              toolMode === mode
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            "
            :disabled="disabled"
            @click="emit('select-tool-mode', mode)"
          >
            {{ toolModeLabel(mode) }}
          </button>
        </div>
        <div class="mt-2 flex items-start justify-between gap-2">
          <span class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            {{ toolModeDescription(toolMode) }}
          </span>
          <button
            type="button"
            class="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
            :disabled="disabled || toolModeOverride === null"
            data-testid="tool-mode-use-default"
            @click="emit('select-tool-mode', null)"
          >
            使用模型默认
          </button>
        </div>
      </div>

      <!-- 内置工具分组开关 -->
      <div class="px-3 py-3">
        <div class="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          工具
        </div>
        <div v-if="toolsLoading" class="text-xs text-muted-foreground">正在加载工具…</div>
        <div
          v-else-if="toolGroups.length === 0"
          class="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          暂无内置工具
        </div>
        <div v-else class="space-y-4">
          <div v-for="group in toolGroups" :key="group.name" class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {{ group.label }}
              </div>
              <button
                type="button"
                role="switch"
                class="relative h-5 w-9 shrink-0 rounded-full"
                :class="isGroupEnabled(group.items, disabledToolNames) ? 'bg-primary' : 'bg-muted'"
                :aria-checked="isGroupEnabled(group.items, disabledToolNames)"
                :disabled="disabled"
                @click="
                  emit('toggle-tool-group', {
                    group: group.name,
                    items: group.items,
                    enabled: !isGroupEnabled(group.items, disabledToolNames)
                  })
                "
              >
                <span
                  class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                  :class="
                    isGroupEnabled(group.items, disabledToolNames)
                      ? 'translate-x-4'
                      : 'translate-x-0'
                  "
                />
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="item in group.items"
                :key="item"
                type="button"
                class="h-7 rounded-md border px-2.5 text-xs"
                :class="
                  !disabledToolNames.includes(item)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                "
                :disabled="disabled"
                @click="emit('toggle-tool', item)"
              >
                {{ item }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
