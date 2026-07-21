<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Switch } from '@shadcn/components/ui/switch'
import { getSkillSwitchStatus, setSkillSwitchStatus, SkillSwitchStatus } from '@jiaorong/utils'
import { readJiaorongSkillFromSession } from '../../lib/sessionSkill'

const route = useRoute()
const router = useRouter()

const skillFromSession = readJiaorongSkillFromSession()
const skillName = computed(() => {
  const fromRoute = typeof route.params.skillId === 'string' ? route.params.skillId : ''
  return (skillFromSession?.name || fromRoute).trim()
})

const displayName = computed(() => {
  const metaName = skillFromSession?.metadata?.displayName
  if (typeof metaName === 'string' && metaName.trim()) {
    return metaName.trim()
  }
  return skillName.value || '未知技能'
})

const switchOn = ref(true)
const switching = ref(false)
const lastResult = ref('')

watch(
  skillName,
  (name) => {
    switchOn.value = !name || getSkillSwitchStatus(name) === SkillSwitchStatus.On
  },
  { immediate: true }
)

async function onSwitchChange(checked: boolean | 'indeterminate') {
  if (!skillName.value || switching.value || checked === 'indeterminate') return
  switching.value = true
  lastResult.value = ''
  try {
    const result = await setSkillSwitchStatus(
      skillName.value,
      checked ? SkillSwitchStatus.On : SkillSwitchStatus.Off
    )
    if (result.success) {
      switchOn.value = result.status === SkillSwitchStatus.On
      lastResult.value =
        result.status === SkillSwitchStatus.On
          ? '已开启（可在输入框使用）'
          : '已关闭（输入框隐藏，不发给模型）'
    } else {
      switchOn.value = getSkillSwitchStatus(skillName.value) === SkillSwitchStatus.On
      lastResult.value = result.error || '切换失败'
    }
  } finally {
    switching.value = false
  }
}

function goBack() {
  void router.push({ name: 'skills' })
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-background">
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="h-8 w-8" @click="goBack">
          <Icon icon="lucide:arrow-left" class="h-4 w-4" />
        </Button>
        <h1 class="text-lg font-semibold truncate">{{ displayName }}</h1>
      </div>

      <p class="text-sm text-muted-foreground break-all">name: {{ skillName || '—' }}</p>

      <div
        class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
      >
        <div class="space-y-0.5 pr-4">
          <p class="text-sm font-medium">启用技能</p>
          <p class="text-xs text-muted-foreground">关闭后不出现在聊天输入框，也不会注入大模型</p>
        </div>
        <Switch
          :model-value="switchOn"
          :disabled="!skillName || switching"
          @update:model-value="onSwitchChange"
        />
      </div>

      <p v-if="lastResult" class="text-sm text-muted-foreground">{{ lastResult }}</p>
    </div>
  </div>
</template>
