<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AgentPlanItem, AssistantMessageBlock } from '../../types'
import ChatApprovalPanel from './ChatApprovalPanel.vue'
import ChatPlanPanel from './ChatPlanPanel.vue'
import ChatQuestionPanel from './ChatQuestionPanel.vue'

const props = defineProps<{
  planItems?: readonly AgentPlanItem[]
  question?: AssistantMessageBlock | null
  approval?: AssistantMessageBlock | null
}>()

const emit = defineEmits<{
  'question-option': [label: string]
  'question-custom': [text: string]
  'respond-approval': [granted: boolean]
  'dismiss-plan': []
}>()

const planCollapsed = ref(false)
const questionExpanded = ref(false)

const hasPlan = computed(() => (props.planItems?.length ?? 0) > 0)
const interaction = computed(() => props.question || props.approval || null)
const isQuestion = computed(() => Boolean(props.question))
const expandedPanel = computed<'plan' | 'question' | null>(() => {
  if (hasPlan.value && !planCollapsed.value) return 'plan'
  if (interaction.value && questionExpanded.value) return 'question'
  return null
})
const planChipVisible = computed(() => hasPlan.value && expandedPanel.value !== 'plan')
const questionChipVisible = computed(
  () => Boolean(interaction.value) && expandedPanel.value !== 'question'
)
const hasDockChips = computed(() => planChipVisible.value || questionChipVisible.value)
const completedCount = computed(
  () => (props.planItems ?? []).filter((item) => item.status === 'completed').length
)
const questionChipIcon = computed(() =>
  isQuestion.value ? 'lucide:message-circle-question' : 'lucide:shield'
)
const questionChipText = computed(() => (isQuestion.value ? '追问' : '工具批准'))
const panelIcon = computed(() =>
  expandedPanel.value === 'plan' ? 'lucide:list-checks' : questionChipIcon.value
)
const panelTitle = computed(() =>
  expandedPanel.value === 'plan' ? '计划' : questionChipText.value
)
const interactionKey = computed(
  () => interaction.value?.tool_call?.id || interaction.value?.id || null
)

watch(
  interactionKey,
  (key) => {
    if (!key) {
      questionExpanded.value = false
      return
    }
    questionExpanded.value = true
    if (hasPlan.value) planCollapsed.value = true
  },
  { immediate: true }
)

watch(hasPlan, (now, before) => {
  if (now && !before && questionExpanded.value) planCollapsed.value = true
  if (!now && before && interaction.value) questionExpanded.value = true
})

function expandPlan() {
  questionExpanded.value = false
  planCollapsed.value = false
}

function expandQuestion() {
  questionExpanded.value = true
  if (hasPlan.value) planCollapsed.value = true
}

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
