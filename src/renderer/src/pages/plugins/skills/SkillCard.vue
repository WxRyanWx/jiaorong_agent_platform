<script setup lang="ts">
import type { UnifiedSkillItem } from '@shared/types/skillManagement'

withDefaults(
  defineProps<{
    skill: UnifiedSkillItem
    disabled?: boolean
  }>(),
  {
    disabled: false
  }
)

const emit = defineEmits<{
  view: []
}>()

function skillProvider(skill: UnifiedSkillItem): string {
  const provider = skill.metadata?.provider
  return typeof provider === 'string' && provider.trim() ? `由 ${provider.trim()} 提供` : ''
}
</script>

<template>
  <button
    :data-testid="`plugin-skill-${skill.name}`"
    type="button"
    :disabled="disabled"
    class="flex h-28 w-full min-w-0 flex-col justify-start gap-2 overflow-hidden rounded-xl border border-border/70 bg-card px-5 py-4 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    @click="emit('view')"
  >
    <span class="block w-full truncate text-base font-medium">
      {{ skill.name }}
    </span>
    <span class="line-clamp-2 w-full text-sm leading-5 text-muted-foreground">
      {{ skill.description }}
    </span>
    <span
      v-if="skillProvider(skill)"
      class="mt-auto block w-full truncate text-xs text-muted-foreground"
      :data-testid="`plugin-skill-provider-${skill.name}`"
    >
      {{ skillProvider(skill) }}
    </span>
  </button>
</template>
