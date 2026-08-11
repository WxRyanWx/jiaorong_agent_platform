<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Button } from '@shadcn/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@shadcn/components/ui/tooltip'
import knowledgeIcon from '../../assets/knowledge.png'
import KnowledgeBasePickerDialog from './KnowledgeBasePickerDialog.vue'

const props = defineProps<{
  sessionId?: string | null
}>()

const open = ref(false)
const tipOpen = ref(false)
/** 弹窗打开期间及关闭后短暂抑制，避免焦点回落误开 tip */
const tipSuppressed = ref(false)

function onTipOpenChange(next: boolean) {
  if (tipSuppressed.value && next) {
    tipOpen.value = false
    return
  }
  tipOpen.value = next
}

function openDialog(event: MouseEvent) {
  tipSuppressed.value = true
  tipOpen.value = false
  open.value = true
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    target.blur()
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    tipSuppressed.value = true
    tipOpen.value = false
    return
  }

  tipOpen.value = false
  await nextTick()
  tipOpen.value = false
  window.setTimeout(() => {
    tipSuppressed.value = false
  }, 200)
})
</script>

<template>
  <Tooltip :open="tipOpen" @update:open="onTipOpenChange">
    <TooltipTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="chat-knowledge-base-button"
        class="chat-input-toolbar-icon h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
        @click="openDialog"
      >
        <img :src="knowledgeIcon" alt="知识库" class="h-4 w-4 object-contain" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>知识库</p>
    </TooltipContent>
  </Tooltip>

  <KnowledgeBasePickerDialog v-model:open="open" :session-id="props.sessionId" />
</template>
