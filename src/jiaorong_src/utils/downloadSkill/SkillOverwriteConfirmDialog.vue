<script setup lang="ts">
import { Button } from '@shadcn/components/ui/button'

const props = defineProps<{
  skillName: string
  onResolved: (confirmed: boolean) => void
}>()

let settled = false

function resolve(confirmed: boolean) {
  if (settled) return
  settled = true
  props.onResolved(confirmed)
}
</script>

<template>
  <!--
    不用 shadcn AlertDialog：createApp 独立挂载时 reka 会给 body 设 pointer-events:none，
    内容层偶发无法恢复点击。这里自管 Teleport + 高 z-index。
  -->
  <Teleport to="body">
    <div
      class="jiaorong-skill-overwrite-mask"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="jiaorong-skill-overwrite-title"
    >
      <div class="jiaorong-skill-overwrite-backdrop" @click="resolve(false)" />
      <div class="jiaorong-skill-overwrite-panel" @click.stop>
        <h2 id="jiaorong-skill-overwrite-title" class="jiaorong-skill-overwrite-title">
          skill 已存在
        </h2>
        <p class="jiaorong-skill-overwrite-desc">
          名为 "{{ skillName || '同名技能' }}" 的 skill 已存在。是否要覆盖？
        </p>
        <div class="jiaorong-skill-overwrite-actions">
          <Button variant="outline" @click="resolve(false)">取消</Button>
          <Button @click="resolve(true)">覆盖</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.jiaorong-skill-overwrite-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  pointer-events: auto;
}

.jiaorong-skill-overwrite-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 80%);
}

.jiaorong-skill-overwrite-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 28rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--background);
  padding: 1.5rem;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 10%),
    0 4px 6px -4px rgb(0 0 0 / 10%);
  pointer-events: auto;
}

.jiaorong-skill-overwrite-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--foreground);
}

.jiaorong-skill-overwrite-desc {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.jiaorong-skill-overwrite-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
</style>
