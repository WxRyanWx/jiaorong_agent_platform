<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { DcButton } from '@dc-ui/components/button'
import { Spinner } from '@shadcn/components/ui/spinner'
import { DcBadge } from '@dc-ui/components/badge'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import { DcSheetPanel } from '@dc-ui/components/sheet-panel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@shadcn/components/ui/select'
import { useMcpStore } from '@/stores/mcp'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import McpJsonViewer from './McpJsonViewer.vue'
import type { MCPToolDefinition } from '@shared/types/mcp'

interface Props {
  serverName: string
}

// interface Emits {
//   (e: 'update:open', value: boolean): void
// }

const props = defineProps<Props>()
const open = defineModel<boolean>('open')
//  const emit = defineEmits<Emits>()

const mcpStore = useMcpStore()
const { t } = useI18n()

// 本地状态
const selectedTool = ref<MCPToolDefinition | null>(null)
const selectedToolName = ref<string>('')
const localToolInputs = ref<Record<string, string>>({})
const localToolResults = ref<Record<string, string>>({})
const jsonError = ref<Record<string, boolean>>({})
const isDescriptionExpanded = ref(false)
const isParametersExpanded = ref(false)

// 计算属性：获取当前服务器的工具
const serverTools = computed(() => {
  return mcpStore.tools.filter((tool) => tool.server.name === props.serverName)
})

// 屏幕断点：lg 及以上
const isLgScreen = useMediaQuery('(min-width: 1024px)')

// 顶部下拉是否显示：小屏时显示；或大屏但左侧列表不可用（无工具）时显示
const showTopSelector = computed(() => {
  return !isLgScreen.value || serverTools.value.length === 0
})

watch(open, (newOpen) => {
  if (newOpen) {
    selectedToolName.value = ''
  }
})

// 当选择工具时，初始化本地输入
watch(selectedToolName, (newToolName) => {
  if (newToolName) {
    const tool = serverTools.value.find((t) => t.function.name === newToolName)
    selectedTool.value = tool || null
    if (!localToolInputs.value[newToolName]) {
      localToolInputs.value[newToolName] = '{}'
    }
    jsonError.value[newToolName] = false
    // 重置折叠状态
    isDescriptionExpanded.value = false
    isParametersExpanded.value = false
  } else {
    selectedTool.value = null
  }
})

// 验证JSON格式
const validateJson = (input: string, toolName: string): boolean => {
  try {
    JSON.parse(input)
    jsonError.value[toolName] = false
    return true
  } catch (e) {
    jsonError.value[toolName] = true
    return false
  }
}

// 调用工具
const callTool = async (toolName: string) => {
  if (!validateJson(localToolInputs.value[toolName], toolName)) {
    return
  }

  try {
    // 调用工具前更新全局store里的参数
    const params = JSON.parse(localToolInputs.value[toolName])
    // 设置全局store参数，以便mcpStore.callTool能使用
    mcpStore.toolInputs[toolName] = params

    // 调用工具
    const result = await mcpStore.callTool(toolName)
    if (result) {
      localToolResults.value[toolName] = result.content || ''
    }
    return result
  } catch (error) {
    console.error('调用工具出错:', error)
    localToolResults.value[toolName] = String(error)
  }
  return
}

// 格式化JSON输入
const formatToolInput = (toolName: string) => {
  try {
    const formatted = JSON.stringify(JSON.parse(localToolInputs.value[toolName]), null, 2)
    localToolInputs.value[toolName] = formatted
  } catch (e) {
    // 忽略格式化错误
  }
}

const asSchemaRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const formatSchemaValue = (value: unknown): string => {
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const asDisplayEnum = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.map(formatSchemaValue) : null

// 计算属性：获取工具参数描述
const toolParametersDescription = computed(() => {
  if (!selectedTool.value?.function.parameters?.properties) return []

  const properties = selectedTool.value.function.parameters.properties
  const required = Array.isArray(selectedTool.value.function.parameters.required)
    ? selectedTool.value.function.parameters.required.filter(
        (value): value is string => typeof value === 'string'
      )
    : []

  return Object.entries(properties).map(([key, value]) => {
    const property = asSchemaRecord(value)
    const propertyType = typeof property.type === 'string' ? property.type : 'unknown'
    const enumValues = asDisplayEnum(property.enum)
    const rawItems = propertyType === 'array' ? asSchemaRecord(property.items) : {}
    const itemEnumValues = asDisplayEnum(rawItems.enum)
    const items =
      Object.keys(rawItems).length > 0
        ? {
            type: typeof rawItems.type === 'string' ? rawItems.type : 'unknown',
            enum: itemEnumValues
          }
        : null

    return {
      name: key,
      description: typeof property.description === 'string' ? property.description : '',
      type: enumValues
        ? 'enum'
        : propertyType === 'array' && itemEnumValues
          ? 'array[enum]'
          : propertyType,
      originalType: propertyType,
      required: required.includes(key),
      enum: enumValues,
      items
    }
  })
})

const requiredParameterNames = computed(() =>
  toolParametersDescription.value
    .filter((parameter) => parameter.required)
    .map((parameter) => parameter.name)
)

const toolInputHint = computed(() => {
  const baseHint = t('mcp.tools.inputHint')
  if (requiredParameterNames.value.length === 0) {
    return baseHint
  }

  return `${baseHint}；${t('routes.devCenterPublishMissing', {
    fields: requiredParameterNames.value.join(', ')
  })}`
})

// 选择工具的处理函数
const selectTool = (tool: MCPToolDefinition) => {
  selectedToolName.value = tool.function.name
}
</script>

<template>
  <DcSheetPanel
    v-model:open="open"
    :title="`${t('mcp.tools.title')} - ${serverName}`"
    :description="t('mcp.tools.dialogDescription')"
    icon="lucide:wrench"
    width-class="w-4/5 min-w-[80vw] max-w-[80vw]"
    :scroll-body="false"
  >
    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- 顶部工具选择下拉菜单：小屏显示；或大屏但左侧列表不可用时显示 -->
      <div v-if="showTopSelector" class="shrink-0 px-4 py-4">
        <Select v-model="selectedToolName">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('mcp.tools.selectToolToDebug')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="tool in serverTools"
              :key="tool.function.name"
              :value="tool.function.name"
            >
              <div class="flex items-center space-x-2">
                <Icon icon="lucide:function-square" class="h-3 w-3 text-primary" />
                <span>{{ tool.function.name }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 大屏幕：左右分列布局 -->
      <div class="flex-1 flex overflow-hidden min-h-0">
        <!-- 左侧工具列表 (仅大屏幕显示) -->
        <div v-if="!showTopSelector" class="flex w-1/3 border-r flex-col">
          <div class="p-4 border-b shrink-0">
            <h3 class="text-sm font-medium text-foreground">{{ t('mcp.tools.toolList') }}</h3>
          </div>
          <ScrollArea class="flex-1 min-h-0">
            <div class="p-2 space-y-1">
              <DcButton
                v-for="tool in serverTools"
                :key="tool.function.name"
                variant="ghost"
                class="w-full justify-start h-auto p-3 text-left"
                :class="{
                  'bg-accent text-accent-foreground': selectedToolName === tool.function.name
                }"
                @click="selectTool(tool)"
              >
                <div class="flex items-start space-x-2 w-full">
                  <Icon
                    icon="lucide:function-square"
                    class="h-4 w-4 text-primary mt-0.5 shrink-0"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">{{ tool.function.name }}</div>
                  </div>
                </div>
              </DcButton>
            </div>
          </ScrollArea>
        </div>

        <!-- 右侧详情区域 -->
        <div class="flex-1 flex flex-col overflow-hidden lg:w-2/3 min-h-0">
          <div v-if="!selectedTool" class="flex items-center justify-center h-full">
            <div class="text-center">
              <div
                class="mx-auto w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3 text-[#5C78A0]"
                style="background-color: #f7fafe"
              >
                <Icon icon="lucide:mouse-pointer-click" class="h-5 w-5 text-muted-foreground" />
              </div>
              <h3
                class="text-base font-medium text-foreground mb-2"
                style="color: #5c78a0; font-size: 16px"
              >
                {{ t('mcp.tools.selectToolToDebug') }}
              </h3>
            </div>
          </div>

          <div v-else class="h-full flex flex-col overflow-hidden min-h-0">
            <ScrollArea class="flex-1 min-h-0">
              <div class="px-4 py-4 space-y-4 pb-8">
                <!-- 工具信息 -->
                <div>
                  <div class="flex items-center space-x-2 mb-2">
                    <Icon icon="lucide:function-square" class="h-5 w-5 text-primary" />
                    <h2 class="text-lg font-semibold text-[#0B2B57]">
                      {{ t('mcp.tools.functionDescription') }}
                    </h2>
                  </div>
                  <p class="text-sm text-[#5C78A0]">
                    {{ selectedTool.function.description || selectedTool.function.name }}
                  </p>
                </div>

                <!-- 工具参数说明（可折叠） -->
                <div
                  v-if="toolParametersDescription.length > 0"
                  class="rounded-lg border border-[#D5E0ED] bg-[#fff]"
                >
                  <DcButton
                    variant="ghost"
                    class="w-full justify-between p-3 h-auto"
                    @click="isParametersExpanded = !isParametersExpanded"
                  >
                    <span class="text-sm font-medium text-[#1C324D]"
                      >{{ t('mcp.tools.parameters') }} ({{
                        toolParametersDescription.length
                      }})</span
                    >
                    <Icon
                      :icon="isParametersExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                      class="h-4 w-4"
                    />
                  </DcButton>
                  <div v-if="isParametersExpanded" class="px-3 pb-3 space-y-2">
                    <div
                      v-for="param in toolParametersDescription"
                      :key="param.name"
                      class="rounded-md border border-[#D5E0ED]/70 bg-[#F7FAFE] p-2"
                    >
                      <div class="mb-1 flex items-center gap-2">
                        <code class="text-sm font-mono font-medium text-[#1C324D]">{{
                          param.name
                        }}</code>
                        <DcBadge
                          v-if="param.required"
                          variant="destructive"
                          class="border-0 bg-[#FFF1F0] px-2 text-xs text-[#F53F3F]"
                        >
                          {{ t('mcp.tools.required') }}
                        </DcBadge>
                        <DcBadge
                          :variant="
                            param.type === 'enum' || param.type === 'array[enum]'
                              ? 'default'
                              : 'outline'
                          "
                          class="px-2 text-xs"
                          :class="
                            param.type === 'enum' || param.type === 'array[enum]'
                              ? 'border-0 bg-[#E8F1FF] text-[#006EFF]'
                              : 'text-[#5C78A0]'
                          "
                        >
                          {{
                            param.type === 'enum'
                              ? `enum(${param.originalType})`
                              : param.type === 'array[enum]'
                                ? `array[enum(${param.items?.type || 'string'})]`
                                : param.type
                          }}
                        </DcBadge>
                      </div>
                      <p v-if="param.description" class="text-xs text-[#5C78A0]">
                        {{ param.description }}
                      </p>
                      <!-- 显示枚举值 -->
                      <div
                        v-if="param.enum && param.enum.length > 0"
                        class="mt-1 flex min-w-0 items-center gap-2 overflow-x-auto"
                      >
                        <p class="shrink-0 whitespace-nowrap text-xs font-medium text-[#5C78A0]">
                          {{ t('mcp.tools.allowedValues') }}:
                        </p>
                        <div class="flex flex-nowrap gap-2">
                          <DcBadge
                            v-for="(enumValue, enumIndex) in param.enum"
                            :key="`${param.name}-enum-${enumIndex}`"
                            variant="secondary"
                            class="border-0 bg-[#F1F5FA] px-2 font-mono text-xs text-[#5C78A0]"
                          >
                            {{ enumValue }}
                          </DcBadge>
                        </div>
                      </div>
                      <!-- 显示数组元素类型的枚举值 -->
                      <div
                        v-if="param.items?.enum && param.items.enum.length > 0"
                        class="mt-1 flex min-w-0 items-center gap-2 overflow-x-auto"
                      >
                        <p class="shrink-0 whitespace-nowrap text-xs font-medium text-[#5C78A0]">
                          {{ t('mcp.tools.arrayItemValues') }}:
                        </p>
                        <div class="flex flex-nowrap gap-2">
                          <DcBadge
                            v-for="(enumValue, enumIndex) in param.items.enum"
                            :key="`${param.name}-item-enum-${enumIndex}`"
                            variant="secondary"
                            class="border-0 bg-[#F1F5FA] px-2 font-mono text-xs text-[#5C78A0]"
                          >
                            {{ enumValue }}
                          </DcBadge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 工具参数输入（调试区域） -->
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-medium text-[#1C324D]">
                      {{ t('mcp.tools.input') }}
                    </h3>
                    <DcButton
                      variant="ghost"
                      size="sm"
                      class="h-6 cursor-pointer px-2 text-xs text-[#5C78A0] hover:text-[#5C78A0]"
                      @click="formatToolInput(selectedTool.function.name)"
                    >
                      <Icon icon="lucide:align-left" class="mr-1 h-3 w-3 text-[#5C78A0]" />
                      {{ t('common.format') }}
                    </DcButton>
                  </div>

                  <div class="relative">
                    <textarea
                      v-model="localToolInputs[selectedTool.function.name]"
                      class="flex h-32 w-full rounded-md border border-[#D5E0ED] bg-[#F7FAFE] px-3 py-2 text-sm font-mono text-[#1C324D] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#5C78A0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      :class="{ 'border-destructive': jsonError[selectedTool.function.name] }"
                      placeholder="{}"
                      @input="
                        validateJson(
                          localToolInputs[selectedTool.function.name],
                          selectedTool.function.name
                        )
                      "
                    />
                    <div
                      v-if="jsonError[selectedTool.function.name]"
                      class="absolute right-3 top-3 text-xs text-destructive"
                    >
                      {{ t('mcp.tools.invalidJson') }}
                    </div>
                  </div>
                  <p class="text-xs text-[#5C78A0]">
                    {{ toolInputHint }}
                  </p>

                  <!-- 执行按钮 -->
                  <DcButton
                    class="w-full cursor-pointer bg-[#006EFF] text-white hover:bg-[#006EFF]"
                    :disabled="
                      mcpStore.toolLoadingStates[selectedTool.function.name] ||
                      jsonError[selectedTool.function.name]
                    "
                    @click="callTool(selectedTool.function.name)"
                  >
                    <Spinner
                      v-if="mcpStore.toolLoadingStates[selectedTool.function.name]"
                      data-icon="inline-start"
                    />
                    <Icon v-else icon="lucide:play" data-icon="inline-start" />
                    {{
                      mcpStore.toolLoadingStates[selectedTool.function.name]
                        ? t('mcp.tools.runningTool')
                        : t('mcp.tools.executeButton')
                    }}
                  </DcButton>
                </div>

                <!-- 结果显示 -->
                <div v-if="localToolResults[selectedTool.function.name]">
                  <McpJsonViewer
                    :content="localToolResults[selectedTool.function.name]"
                    :title="t('mcp.tools.resultTitle')"
                    readonly
                  />
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  </DcSheetPanel>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
