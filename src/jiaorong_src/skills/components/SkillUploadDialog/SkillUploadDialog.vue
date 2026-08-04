<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
import { createDeviceClient } from '@api/DeviceClient'
import { createFileClient } from '@api/FileClient'
import { getRuntimePathForFile } from '@api/runtime'
import type { SkillInstallResult } from '@shared/types/skill'
import {
  installSkillFromFolderCompat,
  installSkillFromMarkdown,
  installSkillFromZipCompat,
  normalizeLocalPath
} from '../../lib/installLocalSkill'
import { formatSkillInstallError } from '../../lib/formatSkillInstallError'
import { rememberSkillSource, SkillSource } from '../../lib/sessionSkill'
import { uninstallSkill } from '../../../utils/skillFileOperations'
import './index.less'

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
const deviceClient = createDeviceClient()
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
/** Win/Linux 无法同框选文件+文件夹；默认按拆分模式，避免平台探测完成前误走 mac 同框逻辑 */
const splitFileFolderPicker = ref(true)
const pickMenuOpen = ref(false)

const conflictDialogOpen = ref(false)
const conflictSkillName = ref('')
const pendingOverwrite = ref<(() => Promise<void>) | null>(null)
/** Win：文件对话框关闭后的幽灵点击会再次打开类型菜单 */
let ignoreDropzoneClickUntil = 0
const ghostClickTimerIds: number[] = []
/**
 * 仅非 darwin 覆盖前先卸载（Win rename 易锁）。
 * 默认 false：平台未探测完时不预卸载，避免 Mac 误走卸载丢备份。
 */
const preferPreUninstallOverwrite = ref(false)

const SKILL_FILE_FILTERS = [
  { name: 'Skill packages', extensions: ['zip', 'md'] },
  { name: 'All files', extensions: ['*'] }
]

function clearGhostClickTimers() {
  for (const id of ghostClickTimerIds) {
    window.clearTimeout(id)
  }
  ghostClickTimerIds.length = 0
}

async function refreshPickerMode() {
  try {
    const info = await deviceClient.getDeviceInfo()
    // Electron：仅 darwin 可同框 openFile+openDirectory；其余平台拆分
    const nonDarwin = info.platform !== 'darwin'
    splitFileFolderPicker.value = nonDarwin
    preferPreUninstallOverwrite.value = nonDarwin
  } catch {
    splitFileFolderPicker.value = true
    // 探测失败时按非 Mac 处理，优先保证 Win 覆盖可用
    preferPreUninstallOverwrite.value = true
  }
}

watch(isOpen, (open) => {
  if (!open) {
    clearGhostClickTimers()
    ignoreDropzoneClickUntil = 0
    preferPreUninstallOverwrite.value = false
    pending.value = null
    dragActive.value = false
    installing.value = false
    pickMenuOpen.value = false
    conflictDialogOpen.value = false
    conflictSkillName.value = ''
    pendingOverwrite.value = null
    return
  }
  void refreshPickerMode()
})

onBeforeUnmount(() => {
  clearGhostClickTimers()
  ignoreDropzoneClickUntil = 0
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

/** 点击上传区：macOS 直接同框选；Win/Linux 先弹出类型菜单（系统限制） */
async function onDropzoneClick() {
  if (installing.value) return
  if (Date.now() < ignoreDropzoneClickUntil) return
  if (splitFileFolderPicker.value) {
    pickMenuOpen.value = !pickMenuOpen.value
    return
  }
  await pickFiles({ allowDirectory: true })
}

async function pickFiles(options: { allowDirectory: boolean }) {
  pickMenuOpen.value = false
  if (installing.value) return
  try {
    const result = await devicePresenter.selectFiles({
      allowDirectory: options.allowDirectory,
      filters: SKILL_FILE_FILTERS
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
      description: formatSkillInstallError(error, 'pick'),
      variant: 'destructive'
    })
  } finally {
    // 关闭系统文件框后，Win 常把一次点击打到 dropzone，再次弹出类型菜单
    suppressPickMenuGhostClick()
  }
}

async function pickFolder() {
  pickMenuOpen.value = false
  if (installing.value) return
  try {
    const result = await deviceClient.selectDirectory()
    if (result.canceled || result.filePaths.length === 0) return
    if (result.filePaths.length > 1) {
      rejectFormat('一次只能选择一个文件或文件夹')
      return
    }
    await classifyPath(result.filePaths[0], true)
  } catch (error) {
    toast({
      title: '选择失败',
      description: formatSkillInstallError(error, 'pick'),
      variant: 'destructive'
    })
  } finally {
    suppressPickMenuGhostClick()
  }
}

/** Win：系统对话框关闭后的幽灵 click 会再次打开类型菜单，盖住「已选择」 */
function suppressPickMenuGhostClick() {
  clearGhostClickTimers()
  pickMenuOpen.value = false
  ignoreDropzoneClickUntil = Date.now() + 1200
  ghostClickTimerIds.push(
    window.setTimeout(() => {
      pickMenuOpen.value = false
    }, 0),
    window.setTimeout(() => {
      pickMenuOpen.value = false
    }, 150)
  )
}

function onPickMenuFiles() {
  void pickFiles({ allowDirectory: false })
}

function onPickMenuFolder() {
  void pickFolder()
}

async function handleDrop(event: DragEvent) {
  dragActive.value = false
  pickMenuOpen.value = false
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

  if (
    result.errorCode === 'conflict' ||
    result.error?.includes('already exists') ||
    result.error?.toLowerCase().includes('conflict')
  ) {
    conflictSkillName.value = result.existingSkillName || result.skillName || ''
    pendingOverwrite.value = retryWithOverwrite
    conflictDialogOpen.value = true
    return
  }

  toast({
    title: '安装失败',
    description: formatSkillInstallError(result.error || '未知错误', sourceKindForError(source)),
    variant: 'destructive'
  })
}

function sourceKindForError(
  source: (typeof SkillSource)[keyof typeof SkillSource]
): 'folder' | 'zip' | 'md' {
  if (source === SkillSource.Folder) return 'folder'
  if (source === SkillSource.Md) return 'md'
  return 'zip'
}

async function runInstall(overwrite = false) {
  const selection = pending.value
  if (!selection || installing.value) return

  installing.value = true
  try {
    // 仅 Win/Linux：覆盖前先卸载；Mac 走宿主 backup，装失败更可恢复
    if (overwrite && preferPreUninstallOverwrite.value) {
      const existing = conflictSkillName.value.trim()
      if (existing) {
        const removed = await uninstallSkill(existing)
        if (!removed.success && removed.error !== 'protected-system-skill') {
          // 卸载失败仍继续走 overwrite，由宿主 backup 兜底
          console.warn('[SkillUploadDialog] pre-overwrite uninstall failed:', removed.error)
        }
      }
    }

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
      description: formatSkillInstallError(error, selection.kind),
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
    <DialogContent class="skill-upload-dialog">
      <DialogHeader class="skill-upload-dialog__header">
        <DialogTitle class="skill-upload-dialog__title">上传技能</DialogTitle>
      </DialogHeader>

      <div class="skill-upload-dialog__body">
        <div
          class="skill-upload-dialog__dropzone"
          :class="{ 'is-drag-active': dragActive, 'is-menu-open': pickMenuOpen }"
          @click="onDropzoneClick"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="handleDrop"
        >
          <Icon
            v-if="installing"
            icon="lucide:loader-2"
            class="skill-upload-dialog__spinner"
          />
          <template v-else-if="pickMenuOpen && splitFileFolderPicker">
            <div class="skill-upload-dialog__pick-menu" @click.stop>
              <p class="skill-upload-dialog__pick-title">请选择上传类型</p>
              <div class="skill-upload-dialog__pick-row">
                <button
                  type="button"
                  class="skill-upload-dialog__pick-item"
                  @click="onPickMenuFiles"
                >
                  <Icon icon="lucide:file" class="skill-upload-dialog__pick-icon" />
                  <span class="skill-upload-dialog__pick-label">选择文件</span>
                  <span class="skill-upload-dialog__pick-hint">.zip / .md</span>
                </button>
                <button
                  type="button"
                  class="skill-upload-dialog__pick-item"
                  @click="onPickMenuFolder"
                >
                  <Icon icon="lucide:folder" class="skill-upload-dialog__pick-icon" />
                  <span class="skill-upload-dialog__pick-label">选择文件夹</span>
                  <span class="skill-upload-dialog__pick-hint">技能目录</span>
                </button>
              </div>
              <button
                type="button"
                class="skill-upload-dialog__pick-cancel"
                @click="pickMenuOpen = false"
              >
                取消
              </button>
            </div>
          </template>
          <template v-else>
            <span class="skill-upload-dialog__plus" aria-hidden="true">+</span>
            <p class="skill-upload-dialog__hint">点击或拖拽文件到此处上传</p>
            <p class="skill-upload-dialog__desc">
              支持上传文件夹或.zip，内容可包含一个或多个非嵌套技能目录；也可以上传单独的.md文件。系统并不能确保技能的可用性，请自行验证。
            </p>
            <p v-if="pending" class="skill-upload-dialog__pending">
              已选择：{{ pending.label }}
              <span class="skill-upload-dialog__pending-kind">
                （{{
                  pending.kind === 'folder'
                    ? '文件夹'
                    : pending.kind === 'zip'
                      ? 'ZIP'
                      : 'Markdown'
                }}）
              </span>
            </p>
          </template>
        </div>
      </div>

      <div class="skill-upload-dialog__footer">
        <Button
          variant="outline"
          class="skill-upload-dialog__btn-cancel"
          :disabled="installing"
          @click="isOpen = false"
        >
          取消
        </Button>
        <Button
          class="skill-upload-dialog__btn-confirm"
          :disabled="!pending || installing"
          @click="runInstall(false)"
        >
          <Icon
            v-if="installing"
            icon="lucide:loader-2"
            class="skill-upload-dialog__btn-spinner"
          />
          确认上传
        </Button>
      </div>
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
