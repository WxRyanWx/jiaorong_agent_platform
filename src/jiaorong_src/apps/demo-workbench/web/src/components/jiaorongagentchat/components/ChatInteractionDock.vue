<!--
  交互坞：在输入区上方收纳计划、追问与工具批准，芯片与展开面板互斥显示。
  主要 props：planItems（计划步骤）、question（追问块）、approval（批准块）。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AgentPlanItem, AssistantMessageBlock } from 'jiaorong-app-sdk'
import ChatApprovalPanel from './ChatApprovalPanel.vue'
import ChatPlanPanel from './ChatPlanPanel.vue'
import ChatQuestionPanel from './ChatQuestionPanel.vue'

/** 交互坞入参：计划步骤、追问块与批准块 */
const props = defineProps<{
  /** Agent 计划步骤 */
  planItems?: readonly AgentPlanItem[]
  /** 当前待回答的追问块 */
  question?: AssistantMessageBlock | null
  /** 当前待处理的工具批准块 */
  approval?: AssistantMessageBlock | null
}>()

/** 向父级抛出的追问 / 批准 / 关闭计划事件 */
const emit = defineEmits<{
  /** 追问选中某个选项，参数为选项标签 */
  'question-option': [label: string]
  /** 追问提交自定义回答 */
  'question-custom': [text: string]
  /** 工具批准结果；granted 为 true 表示允许 */
  'respond-approval': [granted: boolean]
  /** 关闭计划面板 */
  'dismiss-plan': []
}>()

/** 用户把计划面板收成芯片 */
const planCollapsed = ref(false)
/** 追问 / 批准面板是否展开 */
const questionExpanded = ref(false)

/** 是否有计划步骤 */
const hasPlan = computed(() => (props.planItems?.length ?? 0) > 0)
/** 当前交互块：追问优先于批准 */
const interaction = computed(() => props.question || props.approval || null)
/** 当前交互是否为追问（否则视为工具批准） */
const isQuestion = computed(() => Boolean(props.question))
/** 当前展开的面板；计划和交互同时存在时只展开一个 */
const expandedPanel = computed<'plan' | 'question' | null>(() => {
  if (hasPlan.value && !planCollapsed.value) return 'plan'
  if (interaction.value && questionExpanded.value) return 'question'
  return null
})
/** 计划已收起时，底栏显示计划芯片 */
const planChipVisible = computed(() => hasPlan.value && expandedPanel.value !== 'plan')
/** 交互面板未展开时，底栏显示追问 / 批准芯片 */
const questionChipVisible = computed(
  () => Boolean(interaction.value) && expandedPanel.value !== 'question'
)
/** 底栏是否需要渲染芯片条 */
const hasDockChips = computed(() => planChipVisible.value || questionChipVisible.value)
/** 计划完成数，用于芯片徽章 */
const completedCount = computed(
  () => (props.planItems ?? []).filter((item) => item.status === 'completed').length
)
/** 交互芯片图标：追问用问号，批准用盾牌 */
const questionChipIcon = computed(() =>
  isQuestion.value ? 'lucide:message-circle-question' : 'lucide:shield'
)
/** 交互芯片文案 */
const questionChipText = computed(() => (isQuestion.value ? '追问' : '工具批准'))
/** 展开面板标题栏图标 */
const panelIcon = computed(() =>
  expandedPanel.value === 'plan' ? 'lucide:list-checks' : questionChipIcon.value
)
/** 展开面板标题 */
const panelTitle = computed(() =>
  expandedPanel.value === 'plan' ? '计划' : questionChipText.value
)
/** 当前交互块身份，变化时自动展开交互面板 */
const interactionKey = computed(
  () => interaction.value?.tool_call?.id || interaction.value?.id || null
)

watch(
  interactionKey,
  (key) => {
    if (!key) {
      // 没有待处理交互，收起追问 / 批准面板
      questionExpanded.value = false
      return
    }
    questionExpanded.value = true
    // 有新交互时优先展示交互，把计划收成芯片
    if (hasPlan.value) planCollapsed.value = true
  },
  { immediate: true }
)

watch(hasPlan, (now, before) => {
  // 计划刚出现且交互面板已开：先收起计划，避免两个面板抢位
  if (now && !before && questionExpanded.value) planCollapsed.value = true
  // 计划刚消失且仍有交互：重新展开交互面板
  if (!now && before && interaction.value) questionExpanded.value = true
})

/** 展开计划并收起交互面板 */
function expandPlan() {
  questionExpanded.value = false
  planCollapsed.value = false
}

/** 展开追问 / 批准；有计划时把计划收成芯片 */
function expandQuestion() {
  questionExpanded.value = true
  if (hasPlan.value) planCollapsed.value = true
}

/** 收起当前展开面板，回到芯片态 */
function collapseExpandedPanel() {
  if (expandedPanel.value === 'plan') {
    planCollapsed.value = true
    return
  }
  questionExpanded.value = false
}
</script>

<template>
  <div
    v-if="hasPlan || interaction"
    class="flex w-full flex-col-reverse items-center gap-2"
    data-testid="agent-interaction-dock"
  >
    <!-- 底栏芯片：计划 / 追问 / 批准 -->
    <div
      v-if="hasDockChips"
      class="interaction-dock-bar flex h-10 w-full max-w-2xl shrink-0 items-center gap-1.5 rounded-full px-2"
      data-testid="agent-interaction-dock-bar"
    >
      <button
        v-if="planChipVisible"
        type="button"
        class="interaction-dock-chip"
        data-testid="agent-interaction-dock-plan-chip"
        @click="expandPlan"
      >
        <Icon icon="lucide:chevron-right" class="h-3.5 w-3.5" />
        <Icon icon="lucide:list-checks" class="h-3.5 w-3.5 text-primary" />
        <span class="truncate text-xs font-medium">计划</span>
        <span class="interaction-dock-chip__badge">
          {{ completedCount }}/{{ planItems?.length ?? 0 }}
        </span>
      </button>
      <button
        v-if="questionChipVisible"
        type="button"
        class="interaction-dock-chip"
        data-testid="agent-interaction-dock-question-chip"
        @click="expandQuestion"
      >
        <Icon icon="lucide:chevron-right" class="h-3.5 w-3.5" />
        <Icon :icon="questionChipIcon" class="h-3.5 w-3.5 text-primary" />
        <span class="truncate text-xs font-medium">{{ questionChipText }}</span>
      </button>
    </div>
    <!-- 展开面板：计划、追问或工具批准 -->
    <div
      v-if="expandedPanel"
      class="interaction-dock-panel w-full max-w-2xl overflow-hidden rounded-xl"
      data-testid="agent-interaction-dock-panel"
    >
      <div class="flex items-center gap-1.5 px-2 pt-2 pb-1">
        <button
          type="button"
          class="interaction-dock-chip min-w-0 flex-1"
          @click="collapseExpandedPanel"
        >
          <Icon icon="lucide:chevron-right" class="h-3.5 w-3.5 rotate-90" />
          <Icon :icon="panelIcon" class="h-3.5 w-3.5 text-primary" />
          <span class="truncate text-xs font-medium">{{ panelTitle }}</span>
          <span v-if="expandedPanel === 'plan'" class="interaction-dock-chip__badge">
            {{ completedCount }}/{{ planItems?.length ?? 0 }}
          </span>
        </button>
        <button
          v-if="expandedPanel === 'plan'"
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          aria-label="关闭"
          @click="emit('dismiss-plan')"
        >
          <Icon icon="lucide:x" class="h-3 w-3" />
        </button>
      </div>
      <div class="border-t border-border/60">
        <ChatPlanPanel v-if="expandedPanel === 'plan'" :items="planItems ?? []" />
        <ChatQuestionPanel
          v-else-if="question"
          :block="question"
          @option="emit('question-option', $event)"
          @custom="emit('question-custom', $event)"
        />
        <ChatApprovalPanel
          v-else-if="approval"
          :block="approval"
          @respond="emit('respond-approval', $event)"
        />
      </div>
    </div>
  </div>
</template>
