<!--
  生成参数表单：编辑温度、Top P、上下文长度、最大 Token、思考预算、推理力度与详细程度。
  主要 props：settings（当前会话生成设置）、disabled（是否禁用输入）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { SessionGenerationSettings, SessionGenerationSettingsPatch } from '../model/host'

/** 推理力度可选值 */
const REASONING_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
/** 推理力度中文标签 */
const REASONING_LABELS: Record<(typeof REASONING_OPTIONS)[number], string> = {
  none: '关闭',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最大'
}
/** 详细程度可选值 */
const VERBOSITY_OPTIONS = ['low', 'medium', 'high'] as const
/** 详细程度中文标签 */
const VERBOSITY_LABELS: Record<(typeof VERBOSITY_OPTIONS)[number], string> = {
  low: '低',
  medium: '中',
  high: '高'
}

/** 生成参数表单入参，供各数字 / 下拉控件读取 */
const props = defineProps<{
  /** 当前生成设置，空则按默认占位展示 */
  settings?: SessionGenerationSettings | null
  /** 为 true 时禁用全部控件 */
  disabled?: boolean
}>()

/** 向父级抛出的生成参数变更 */
const emit = defineEmits<{
  /** 某一生成参数变更，payload 为补丁 */
  change: [payload: SessionGenerationSettingsPatch]
}>()

/** 实际绑定到表单的设置对象，空值用空对象兜底 */
const current = computed(() => props.settings ?? {})

/** 把数字输入写成补丁；非有限数直接丢弃，避免写入 NaN */
function emitNumber(key: keyof SessionGenerationSettingsPatch, raw: string) {
  const next = Number(raw)
  if (!Number.isFinite(next)) return
  emit('change', { [key]: next })
}

/** 可清空的数字项：空字符串表示恢复默认（undefined） */
function emitOptionalNumber(key: keyof SessionGenerationSettingsPatch, raw: string) {
  if (!raw.trim()) {
    emit('change', { [key]: undefined })
    return
  }
  emitNumber(key, raw)
}
</script>

<template>
  <div class="space-y-4">
    <!-- 温度 -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">温度</span>
      <input
        type="number"
        min="0"
        max="2"
        step="0.1"
        class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs tabular-nums"
        :disabled="disabled"
        :value="current.temperature ?? ''"
        placeholder="使用默认值"
        @change="emitNumber('temperature', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <!-- Top P -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">Top P</span>
      <input
        type="number"
        min="0.1"
        max="1"
        step="0.05"
        class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs tabular-nums"
        :disabled="disabled"
        :value="current.topP ?? ''"
        placeholder="使用默认值"
        @change="emitOptionalNumber('topP', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <!-- 上下文长度 -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">上下文长度</span>
      <input
        type="number"
        min="1"
        step="1"
        class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs tabular-nums"
        :disabled="disabled"
        :value="current.contextLength ?? ''"
        placeholder="使用默认值"
        @change="emitNumber('contextLength', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <!-- 最大 Token -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">最大 Token</span>
      <input
        type="number"
        min="1"
        step="1"
        class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs tabular-nums"
        :disabled="disabled"
        :value="current.maxTokens ?? ''"
        placeholder="使用默认值"
        @change="emitNumber('maxTokens', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <!-- 思考预算 -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">思考预算</span>
      <input
        type="number"
        min="0"
        step="1"
        class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs tabular-nums"
        :disabled="disabled"
        :value="current.thinkingBudget ?? ''"
        placeholder="使用默认值"
        @change="emitOptionalNumber('thinkingBudget', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <!-- 推理力度 -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">推理力度</span>
      <select
        class="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        :disabled="disabled"
        :value="current.reasoningEffort ?? ''"
        @change="
          emit('change', {
            reasoningEffort: (($event.target as HTMLSelectElement).value ||
              undefined) as SessionGenerationSettings['reasoningEffort']
          })
        "
      >
        <option value="">使用默认值</option>
        <option v-for="item in REASONING_OPTIONS" :key="item" :value="item">
          {{ REASONING_LABELS[item] }}
        </option>
      </select>
    </label>
    <!-- 详细程度 -->
    <label class="block space-y-1.5">
      <span class="text-xs font-medium">详细程度</span>
      <select
        class="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        :disabled="disabled"
        :value="current.verbosity ?? ''"
        @change="
          emit('change', {
            verbosity: (($event.target as HTMLSelectElement).value ||
              undefined) as SessionGenerationSettings['verbosity']
          })
        "
      >
        <option value="">使用默认值</option>
        <option v-for="item in VERBOSITY_OPTIONS" :key="item" :value="item">
          {{ VERBOSITY_LABELS[item] }}
        </option>
      </select>
    </label>
  </div>
</template>
