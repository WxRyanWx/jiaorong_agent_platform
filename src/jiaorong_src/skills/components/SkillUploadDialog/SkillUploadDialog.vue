<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { Button } from '@shadcn/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shadcn/components/ui/dialog'
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
import { useToast } from '@/components/use-toast'
import { useSkillsStore } from '@/stores/skillsStore'
import { useLegacyPresenter } from '@api/legacy/presenters'
import { createFileClient } from '@api/FileClient'
import { getRuntimePathForFile } from '@api/runtime'
import type { SkillInstallResult } from '@shared/types/skill'
import {
  installSkillFromFolderCompat,
  installSkillFromMarkdown,
  installSkillFromZipCompat,
  normalizeLocalPath
} from '../../lib/installLocalSkill'
import { rememberSkillSource, SkillSource } from '../../lib/sessionSkill'

type PendingKind = 'folder' | 'zip' | 'md'

type PendingSelection = {
  kind: PendingKind
  path: string
  label: string
}

function sourceFromKind(kind: PendingKind) {
  if (kind === 'folder') return SkillSource.Folder
  if (kind === 'zip') return SkillSource.Zip
  return SkillSource.Md
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  installed: []
}>()

const { toast } = useToast()
const skillsStore = useSkillsStore()
const devicePresenter = useLegacyPresenter('devicePresenter')
// safeCall:false — writeTemp 失败时不要吞成 null（否则 installFromZip 会报 zipPath null）
const filePresenter = useLegacyPresenter('filePresenter', { safeCall: false })
const fileClient = createFileClient()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const dragActive = ref(false)
const installing = ref(false)
const pending = ref<PendingSelection | null>(null)

const conflictDialogOpen = ref(false)
const conflictSkillName = ref('')
const pendingOverwrite = ref<(() => Promise<void>) | null>(null)

watch(isOpen, (open) => {
  if (!open) {
    pending.value = null
    dragActive.value = false
    installing.value = false
    conflictDialogOpen.value = false
    conflictSkillName.value = ''
    pendingOverwrite.value = null
  }
})

function isZipPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.zip')
}

function isMdPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md')
}

function setPending(kind: PendingKind, filePath: string) {
  const normalized = normalizeLocalPath(filePath)
  const label = normalized.split(/[/\\]/).filter(Boolean).pop() || normalized
  pending.value = { kind, path: normalized, label }
}

function rejectFormat(message = '仅支持文件夹、.zip 或 .md 文件') {
  toast({
    title: '格式不支持',
    description: message,
    variant: 'destructive'
  })
}

/** legacy IPC 会弄坏 Uint8Array/ArrayBuffer，改传 number[] 供主进程 Buffer.from */
function toWriteTempContent(
  content: string | Buffer | ArrayBuffer | Uint8Array
): string | Buffer | ArrayBuffer | number[] {
  if (typeof content === 'string') {
    return content
  }
  if (content instanceof Uint8Array) {
    return Array.from(content)
  }
  if (content instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(content))
  }
  return content
}

function installDeps() {
  return {
    writeTemp: async (file: {
      name: string
      content: string | Buffer | ArrayBuffer | Uint8Array
    }) => {
      const tempPath = await filePresenter.writeTemp({
        name: file.name,
        content: toWriteTempContent(file.content)
      })
      if (typeof tempPath !== 'string' || !tempPath) {
        throw new Error('写入临时文件失败，请重试')
      }
      return tempPath
    },
    installFromFolder: (folderPath: string, options?: { overwrite?: boolean }) =>
      skillsStore.installFromFolder(folderPath, options),
    installFromZip: (zipPath: string, options?: { overwrite?: boolean }) =>
      skillsStore.installFromZip(zipPath, options)
  }
}

async function classifyPath(filePath: string, isDirectoryHint: boolean) {
  const normalized = normalizeLocalPath(filePath)
  if (isDirectoryHint) {
    setPending('folder', normalized)
    return
  }
  if (isZipPath(normalized)) {
    setPending('zip', normalized)
    return
  }
  if (isMdPath(normalized)) {
    setPending('md', normalized)
    return
  }
  // 对话框选中的目录通常无扩展名
  const base = normalized.split(/[/\\]/).pop() || ''
  if (!base.includes('.')) {
    setPending('folder', normalized)
    return
  }
  try {
    if (await fileClient.isDirectory(normalized)) {
      setPending('folder', normalized)
      return
    }
  } catch {
    // ignore
  }
  rejectFormat()
}

/** 单一入口：同一对话框可选 zip / md / 文件夹 */
async function pickSource() {
  if (installing.value) return
  try {
    const result = await devicePresenter.selectFiles({
      allowDirectory: true,
      filters: [
        { name: 'Skill packages', extensions: ['zip', 'md'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return
    if (result.filePaths.length > 1) {
      rejectFormat('一次只能选择一个文件或文件夹')
      return
    }
    await classifyPath(result.filePaths[0], false)
  } catch (error) {
    toast({
      title: '选择失败',
      description: String(error),
      variant: 'destructive'
    })
  }
}

async function handleDrop(event: DragEvent) {
  dragActive.value = false
  if (installing.value) return

  const items = event.dataTransfer?.items
  const files = event.dataTransfer?.files
  if (!items || items.length === 0) return

  if (items.length > 1 || (files && files.length > 1)) {
    rejectFormat('一次只能拖入一个文件或文件夹')
    return
  }

  const item = items[0]
  const entry = item.webkitGetAsEntry?.()
  const file = item.getAsFile?.()
  if (!file) {
    rejectFormat()
    return
  }

  const filePath = getRuntimePathForFile(file)
  if (!filePath) {
    rejectFormat('无法读取本地路径')
    return
  }

  await classifyPath(filePath, Boolean(entry?.isDirectory))
}

function handleInstallResult(
  result: SkillInstallResult,
  source: (typeof SkillSource)[keyof typeof SkillSource],
  retryWithOverwrite: () => Promise<void>
) {
  if (result.success) {
    if (result.skillName) {
      rememberSkillSource(result.skillName, source)
    }
    toast({
      title: '安装成功',
      description: result.skillName ? `已安装技能「${result.skillName}」` : '技能已安装'
    })
    emit('installed')
    isOpen.value = false
    return
  }

  if (result.errorCode === 'conflict' || result.error?.includes('already exists')) {
    conflictSkillName.value = result.existingSkillName || result.skillName || ''
    pendingOverwrite.value = retryWithOverwrite
    conflictDialogOpen.value = true
    return
  }

  toast({
    title: '安装失败',
    description: result.error || '未知错误',
    variant: 'destructive'
  })
}

async function runInstall(overwrite = false) {
  const selection = pending.value
  if (!selection || installing.value) return

  installing.value = true
  try {
    const deps = installDeps()
    const source = sourceFromKind(selection.kind)
    let result: SkillInstallResult
    if (selection.kind === 'folder') {
      result = await installSkillFromFolderCompat({
        folderPath: selection.path,
        overwrite,
        ...deps
      })
    } else if (selection.kind === 'zip') {
      result = await installSkillFromZipCompat({
        zipPath: selection.path,
        overwrite,
        ...deps
      })
    } else {
      result = await installSkillFromMarkdown({
        mdPath: selection.path,
        overwrite,
        ...deps
      })
    }
    handleInstallResult(result, source, () => runInstall(true))
  } catch (error) {
    toast({
      title: '安装失败',
      description: String(error),
      variant: 'destructive'
    })
  } finally {
    installing.value = false
  }
}

const handleConflictCancel = () => {
  conflictDialogOpen.value = false
  pendingOverwrite.value = null
  conflictSkillName.value = ''
}

const handleConflictOverwrite = async () => {
  conflictDialogOpen.value = false
  if (pendingOverwrite.value) {
    await pendingOverwrite.value()
    pendingOverwrite.value = null
  }
  conflictSkillName.value = ''
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>上传文件</DialogTitle>
      </DialogHeader>

      <div
        class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors"
        :class="
          dragActive ? 'border-primary bg-primary/5' : 'border-border/80 hover:border-primary/50'
        "
        @click="pickSource"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="handleDrop"
      >
        <Icon
          v-if="!installing"
          icon="lucide:upload"
          class="pointer-events-none mb-3 h-10 w-10 text-muted-foreground"
        />
        <Icon
          v-else
          icon="lucide:loader-2"
          class="pointer-events-none mb-3 h-10 w-10 animate-spin text-muted-foreground"
        />
        <p class="pointer-events-none text-sm font-medium text-foreground">
          点击上传或直接拖拽到此处上传
        </p>
        <p class="pointer-events-none mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          支持上传文件夹或 .zip，内容可包含一个或多个非嵌套目录；也可以上传单独的 .md
          文件。系统并不能确保技能的可用性，请自行验证。
        </p>
        <p v-if="pending" class="pointer-events-none mt-4 max-w-full truncate text-xs text-primary">
          已选择：{{ pending.label }}
          <span class="text-muted-foreground">
            （{{
              pending.kind === 'folder' ? '文件夹' : pending.kind === 'zip' ? 'ZIP' : 'Markdown'
            }}）
          </span>
        </p>
      </div>

      <Button
        class="mt-4 w-full"
        size="lg"
        :disabled="!pending || installing"
        @click="runInstall(false)"
      >
        <Icon v-if="installing" icon="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
        创建技能
      </Button>
    </DialogContent>
  </Dialog>

  <AlertDialog v-model:open="conflictDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>技能已存在</AlertDialogTitle>
        <AlertDialogDescription>
          技能「{{ conflictSkillName || '同名技能' }}」已安装，是否覆盖？
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleConflictCancel">取消</AlertDialogCancel>
        <AlertDialogAction @click="handleConflictOverwrite">覆盖</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
