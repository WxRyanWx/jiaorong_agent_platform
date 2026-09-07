<template>
  <div
    data-testid="chat-message-user"
    class="flex min-w-0 max-w-full flex-row-reverse group pt-5 pl-11 gap-2 user-message-item"
  >
    <div class="w-5 h-5 bg-muted rounded-md overflow-hidden">
      <div class="w-full h-full flex items-center justify-center text-muted-foreground">
        <Icon icon="lucide:user" class="w-4 h-4" />
      </div>
    </div>
    <div class="flex flex-col w-full space-y-1.5 items-end">
      <MessageInfo class="flex-row-reverse" :name="userName" :timestamp="timestamp" />
      <div
        v-if="skills.length"
        class="flex max-w-full flex-wrap justify-end gap-1.5 pr-1"
      >
        <span
          v-for="skillName in skills"
          :key="skillName"
          class="inline-flex h-5 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 text-[11px] leading-none text-muted-foreground shadow-sm"
        >
          <Icon icon="lucide:sparkles" class="h-3 w-3 text-primary/70" />
          {{ skillName }}
        </span>
      </div>
      <div
        class="text-sm bg-muted dark:bg-muted rounded-lg p-2 border flex flex-col gap-1.5"
        data-message-content="true"
      >
        <div v-if="files.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="file in files"
            :key="file"
            class="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm"
          >
            <Icon icon="lucide:paperclip" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="max-w-[180px] truncate">{{ file }}</span>
          </span>
        </div>
        <div class="w-full min-w-0 text-sm break-all whitespace-pre-wrap">{{ text }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import MessageInfo from './MessageInfo.vue'

defineProps<{
  userName: string
  timestamp: number
  text: string
  files: string[]
  skills: string[]
}>()
</script>
