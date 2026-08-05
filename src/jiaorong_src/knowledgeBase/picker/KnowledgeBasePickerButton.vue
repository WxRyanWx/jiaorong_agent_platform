<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@shadcn/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@shadcn/components/ui/tooltip'
import knowledgeIcon from '../../assets/knowledge.png'
import KnowledgeBasePickerDialog from './KnowledgeBasePickerDialog.vue'

const props = defineProps<{
  sessionId?: string | null
}>()

const open = ref(false)
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="chat-knowledge-base-button"
        class="chat-input-toolbar-icon h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
        @click="open = true"
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
