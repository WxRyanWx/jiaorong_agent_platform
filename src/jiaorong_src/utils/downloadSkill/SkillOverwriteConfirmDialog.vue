<script setup lang="ts">
import { ref } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@shadcn/components/ui/alert-dialog'

const props = defineProps<{
  skillName: string
  onResolved: (confirmed: boolean) => void
}>()

const open = ref(true)
let settled = false

function resolve(confirmed: boolean) {
  if (settled) return
  settled = true
  open.value = false
  props.onResolved(confirmed)
}

function onOpenChange(value: boolean) {
  open.value = value
  if (!value) {
    resolve(false)
  }
}
</script>

<template>
  <AlertDialog :open="open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>skill 已存在</AlertDialogTitle>
        <AlertDialogDescription>
          名为 "{{ skillName || '同名技能' }}" 的 skill 已存在。是否要覆盖？
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="resolve(false)">取消</AlertDialogCancel>
        <AlertDialogAction @click="resolve(true)">覆盖</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
