<!--
  工具调用块：折叠胶囊展示工具名、摘要与批准状态，展开后看参数和响应。
  主要 props：block（工具调用块）、permissionStatus（granted / denied）。
-->
<template>
  <div class="flex min-w-0 flex-col w-full max-w-full">
    <!-- 折叠触发：状态、工具名、路径/命令摘要、批准徽标 -->
    <button
      type="button"
      data-testid="tool-call-trigger"
      class="tool-call-pill inline-flex w-fit min-h-7 border rounded-lg items-center gap-2 px-2 py-1.5 text-left text-xs leading-4 transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] select-none overflow-hidden bg-accent hover:bg-accent/40"
      :aria-expanded="isExpanded"
      @click="onToggle"
    >
      <span
        v-if="statusVariant === 'running'"
        data-testid="tool-call-running-indicator"
        class="tool-call-status-ring shrink-0"
        aria-hidden="true"
      />
      <Icon v-else :icon="statusIconName" :class="['w-3.5 h-3.5 shrink-0', statusIconClass]" />
      <div class="tool-call-labels flex items-center gap-2 font-mono font-medium min-w-0">
        <span data-testid="tool-call-name" class="shrink-0 text-xs text-foreground/80 leading-none">
          {{ displayFunctionName }}
        </span>
        <span
          v-if="summaryText"
          data-testid="tool-call-summary"
          class="tool-call-summary text-[11px]"
          :title="summaryText"
        >
          {{ summaryText }}
        </span>
      </div>
      <span
        v-if="permissionStatus"
        data-testid="tool-call-permission-badge"
        :class="[
          'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
          permissionStatus === 'granted'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
            : 'border-red-500/20 bg-red-500/10 text-red-700'
        ]"
      >
        {{ permissionStatus === 'granted' ? '已允许' : '已拒绝' }}
      </span>
      <Icon
        icon="lucide:chevron-right"
        class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
        :class="isExpanded ? 'rotate-90' : 'rotate-0'"
        aria-hidden="true"
      />
    </button>

    <!-- 展开详情：参数与响应 -->
    <div
      class="grid w-full overflow-hidden transition-[grid-template-rows,opacity,margin-top,margin-bottom] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]"
      :class="
        isExpanded
          ? 'mt-2 mb-4 grid-rows-[1fr] opacity-100'
          : 'mt-0 mb-0 grid-rows-[0fr] opacity-0 pointer-events-none'
      "
    >
      <div class="min-h-0 overflow-hidden">
        <div
          class="w-full rounded-lg border bg-muted px-2 py-3 text-card-foreground overscroll-contain"
        >
          <div class="flex flex-col gap-4">
            <div
              v-if="displayFunctionName"
              class="truncate text-xs font-mono font-medium text-foreground/75"
            >
              {{ displayFunctionName }}
            </div>
            <div v-if="hasParams" class="space-y-2 flex-1 min-w-0">
              <h5
                class="text-xs font-medium text-accent-foreground flex flex-row gap-2 items-center"
              >
                <Icon icon="lucide:arrow-up-from-dot" class="w-4 h-4 text-foreground" />
                参数
              </h5>
              <div
                data-testid="tool-call-params"
                class="rounded-md border bg-background text-xs p-2 min-h-0 max-h-20 overflow-auto"
              >
                {{ paramsText }}
              </div>
            </div>
            <div v-if="hasResponse" class="space-y-2 flex-1 min-w-0">
              <h5
                class="text-xs font-medium text-accent-foreground flex flex-row gap-2 items-center"
              >
                <Icon icon="lucide:arrow-down-to-dot" class="w-4 h-4 text-foreground" />
                响应
              </h5>
              <div
                data-testid="tool-call-response"
                class="rounded-md border bg-background text-xs p-2 min-h-0 max-h-40 overflow-auto whitespace-pre-wrap"
              >
                {{ responseText }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { DisplayAssistantMessageBlock } from '../model/display'

/** 工具调用块入参，供胶囊摘要与展开详情使用 */
const props = defineProps<{
  /** 工具调用类型的助手消息块 */
  block: DisplayAssistantMessageBlock
  /** 该调用最终批准结果，没有则不显示徽标 */
  permissionStatus?: 'granted' | 'denied'
}>()

/** 详情是否展开 */
const isExpanded = ref(false)

/** 切换参数 / 响应详情 */
function onToggle() {
  isExpanded.value = !isExpanded.value
}
/** 原始参数文本 */
const paramsText = computed(() => props.block.tool_call?.params ?? '')
/** 原始响应文本 */
const responseText = computed(() => props.block.tool_call?.response ?? '')
/** 有非空参数才渲染参数区 */
const hasParams = computed(() => paramsText.value.trim().length > 0)
/** 有非空响应才渲染响应区 */
const hasResponse = computed(() => responseText.value.trim().length > 0)
/** 胶囊上的工具名，缺省用「工具调用」 */
const displayFunctionName = computed(() => props.block.tool_call?.name?.trim() || '工具调用')
/** 从 JSON 参数里抽 path 或 command 作一行摘要；解析失败则不显示 */
const summaryText = computed(() => {
  const raw = paramsText.value.trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const path = typeof parsed.path === 'string' ? parsed.path : ''
    const command = typeof parsed.command === 'string' ? parsed.command : ''
    return path || command
  } catch {
    return ''
  }
})

/** 把块状态映射成胶囊视觉变体 */
const statusVariant = computed(() => {
  if (props.block.status === 'error') return 'error'
  if (props.block.status === 'success') return 'success'
  if (props.block.status === 'loading') return 'running'
  return 'neutral'
})

/** 非运行中时的状态图标 */
const statusIconName = computed(() => {
  if (statusVariant.value === 'error') return 'lucide:x'
  return 'lucide:circle-small'
})

/** 状态图标颜色 */
const statusIconClass = computed(() => {
  if (statusVariant.value === 'error') return 'text-destructive'
  if (statusVariant.value === 'success') return 'text-emerald-500'
  return 'text-muted-foreground'
})
</script>

<style scoped>
.tool-call-pill {
  max-width: 100%;
}

.tool-call-labels {
  min-width: 0;
}

.tool-call-summary {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  padding-block: 1px;
  color: color-mix(in srgb, var(--muted-foreground) 90%, transparent);
  font-weight: 400;
}

.tool-call-status-ring {
  position: relative;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--muted-foreground) 32%, transparent);
}

.tool-call-status-ring::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  border: 1px solid hsl(45 96% 62% / 0.88);
  opacity: 0.9;
}
</style>
