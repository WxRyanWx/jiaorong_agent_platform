<script setup lang="ts">
defineOptions({ name: 'OpenPlatformAssetPane' })

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Button } from '@arco-design/web-vue'
import { Input } from '@shadcn/components/ui/input'
import { useToast } from '@/components/use-toast'
import ConfirmAction from './ConfirmAction.vue'
import type { OpenPlatformAssetSummary, OpenPlatformClient } from '../types'
import { parseConnectorPackage, parseSkillPackage } from '../packages/parseOpenPlatformPackage'

const props = defineProps<{
  api: OpenPlatformClient
  assetType: 'skill' | 'connector'
}>()

type ParsedPackage = {
  name: string
  displayName: string
  description: string
  type?: string
}

const { t } = useI18n()
const { toast } = useToast()
const items = ref<OpenPlatformAssetSummary[]>([])
const publishProviders = ref<Record<string, string>>({})
const updateTarget = ref<OpenPlatformAssetSummary | null>(null)
const pendingUpdatePackage = ref<ParsedPackage | null>(null)
const isUpdateConfirmVisible = ref(false)
const packageInput = ref<HTMLInputElement | null>(null)
const error = ref('')
const isPublishing = ref(false)
const isLoading = ref(false)

const DEV_DOCS_URLS: Record<'skill' | 'connector', string> = {
  skill: 'https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/skills.html',
  connector:
    'https://c4ai.ccccltd.cn/jiaorong-super-agent-doc/Examples/jiaorong-agent/connectors.html'
}
const CREATE_LABELS: Record<'skill' | 'connector', string> = {
  skill: '创建技能',
  connector: '创建连接器'
}
const UPDATE_LABELS: Record<'skill' | 'connector', string> = {
  skill: '更新技能',
  connector: '更新连接器'
}
async function refresh(): Promise<void> {
  isLoading.value = true
  error.value = ''
  try {
    const page =
      props.assetType === 'skill'
        ? await props.api.listSkills()
        : await props.api.listConnectors('mine')
    items.value = page.items
    publishProviders.value = Object.fromEntries(
      page.items.map((item) => [item.id, item.provider ?? ''])
    )
  } catch (loadError) {
    error.value =
      loadError instanceof Error ? loadError.message : t('routes.openPlatformListFailed')
  } finally {
    isLoading.value = false
  }
}

async function choosePackage(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  error.value = ''
  if (!file) return
  try {
    const parsedPackage = await parsePackage(file)
    const target = updateTarget.value
    if (target) {
      if (target.id !== parsedPackage.name) throw new Error('包内 ID 与当前内容不一致')
      pendingUpdatePackage.value = parsedPackage
      isUpdateConfirmVisible.value = true
      return
    }
    if (props.assetType === 'skill') {
      await props.api.createSkill({
        metadata: {
          name: parsedPackage.name,
          displayName: parsedPackage.displayName,
          description: parsedPackage.description
        }
      })
    } else {
      await props.api.createConnector({
        metadata: {
          id: parsedPackage.name,
          name: parsedPackage.name,
          description: parsedPackage.description,
          type: (parsedPackage.type ?? 'stdio') as 'stdio' | 'http' | 'sse'
        }
      })
    }
    await refresh()
    toast({ title: '创建成功' })
  } catch (parseError) {
    updateTarget.value = null
    pendingUpdatePackage.value = null
    isUpdateConfirmVisible.value = false
    error.value =
      parseError instanceof Error ? parseError.message : t('routes.openPlatformPackageInvalid')
  } finally {
    input.value = ''
  }
}

async function parsePackage(file: File): Promise<ParsedPackage> {
  if (props.assetType === 'skill') return parseSkillPackage(file)
  const metadata = await parseConnectorPackage(file)
  return {
    name: metadata.id,
    displayName: metadata.id,
    description: metadata.description,
    type: metadata.type
  }
}

async function publishDraft(item: OpenPlatformAssetSummary): Promise<void> {
  if (item.status !== 'draft' || isPublishing.value) return
  const provider = readPublishProvider(item)
  if (!provider) return
  isPublishing.value = true
  error.value = ''
  try {
    if (props.assetType === 'skill') {
      await props.api.publishSkill({
        id: item.id,
        provider,
        metadata: {
          name: item.id,
          displayName: item.name,
          description: item.description
        }
      })
    } else {
      await props.api.publishConnector({
        id: item.id,
        provider,
        metadata: {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.connectorType ?? 'http'
        }
      })
    }
    await refresh()
    toast({ title: '发布成功' })
  } catch (publishError) {
    error.value =
      publishError instanceof Error ? publishError.message : t('routes.openPlatformPublishFailed')
  } finally {
    isPublishing.value = false
  }
}

async function updatePackage(
  item: OpenPlatformAssetSummary,
  parsedPackage: ParsedPackage
): Promise<void> {
  if (isPublishing.value) return
  const provider = readPublishProvider(item)
  if (!provider) return
  isPublishing.value = true
  error.value = ''
  try {
    if (props.assetType === 'skill') {
      await props.api.publishSkill({
        id: item.id,
        provider,
        metadata: {
          name: parsedPackage.name,
          displayName: parsedPackage.displayName,
          description: parsedPackage.description
        }
      })
    } else {
      await props.api.publishConnector({
        id: item.id,
        provider,
        metadata: {
          id: parsedPackage.name,
          name: parsedPackage.name,
          description: parsedPackage.description,
          type: (parsedPackage.type ?? 'stdio') as 'stdio' | 'http' | 'sse'
        }
      })
    }
    updateTarget.value = null
    await refresh()
    toast({ title: '更新成功' })
  } catch (publishError) {
    error.value =
      publishError instanceof Error ? publishError.message : t('routes.openPlatformPublishFailed')
  } finally {
    isPublishing.value = false
  }
}

async function unpublish(item: OpenPlatformAssetSummary): Promise<void> {
  if (item.status !== 'published' || isPublishing.value) return
  isPublishing.value = true
  error.value = ''
  try {
    if (props.assetType === 'skill') await props.api.unpublishSkill(item.id)
    else await props.api.unpublishConnector(item.id)
    await refresh()
    toast({ title: '下架成功' })
  } catch (unpublishError) {
    error.value =
      unpublishError instanceof Error
        ? unpublishError.message
        : t('routes.openPlatformUnpublishFailed')
  } finally {
    isPublishing.value = false
  }
}

async function remove(item: OpenPlatformAssetSummary): Promise<void> {
  if ((item.status !== 'draft' && item.status !== 'unpublished') || isPublishing.value) return
  isPublishing.value = true
  error.value = ''
  try {
    if (props.assetType === 'skill') await props.api.removeSkill(item.id)
    else await props.api.removeConnector(item.id)
    await refresh()
  } catch (removeError) {
    error.value = removeError instanceof Error ? removeError.message : '移除失败，请稍后重试'
  } finally {
    isPublishing.value = false
  }
}

async function republish(item: OpenPlatformAssetSummary): Promise<void> {
  if (item.status !== 'unpublished' || isPublishing.value) return
  const provider = readPublishProvider(item)
  if (!provider) return
  isPublishing.value = true
  error.value = ''
  try {
    if (props.assetType === 'skill') {
      await props.api.publishSkill({
        id: item.id,
        provider,
        metadata: {
          name: item.id,
          displayName: item.name,
          description: item.description
        }
      })
    } else {
      await props.api.publishConnector({
        id: item.id,
        provider,
        metadata: {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.connectorType ?? 'http'
        }
      })
    }
    await refresh()
    toast({ title: '重新发布成功' })
  } catch (publishError) {
    error.value =
      publishError instanceof Error ? publishError.message : t('routes.openPlatformPublishFailed')
  } finally {
    isPublishing.value = false
  }
}

function startCreate(): void {
  if (isPublishing.value) return
  updateTarget.value = null
  pendingUpdatePackage.value = null
  isUpdateConfirmVisible.value = false
  error.value = ''
  packageInput.value?.click()
}

function startUpdate(item: OpenPlatformAssetSummary): void {
  if (isPublishing.value) return
  if (!readPublishProvider(item)) {
    error.value = t('routes.openPlatformPublishOrganizationRequired')
    return
  }
  updateTarget.value = item
  pendingUpdatePackage.value = null
  isUpdateConfirmVisible.value = false
  error.value = ''
  packageInput.value?.click()
}

function handleUpdateVisible(item: OpenPlatformAssetSummary, visible: boolean): void {
  if (visible) {
    startUpdate(item)
    return
  }
  if (updateTarget.value?.id !== item.id) return
  updateTarget.value = null
  pendingUpdatePackage.value = null
  isUpdateConfirmVisible.value = false
}

async function submitUpdate(item: OpenPlatformAssetSummary): Promise<void> {
  const parsedPackage = pendingUpdatePackage.value
  if (!parsedPackage) return
  updateTarget.value = null
  pendingUpdatePackage.value = null
  isUpdateConfirmVisible.value = false
  await updatePackage(item, parsedPackage)
}

function readPublishProvider(item: OpenPlatformAssetSummary): string {
  return publishProviders.value[item.id]?.trim() ?? ''
}

function isPublishProviderReady(item: OpenPlatformAssetSummary): boolean {
  return Boolean(readPublishProvider(item))
}

onMounted(refresh)

function openDocs(): void {
  window.open(DEV_DOCS_URLS[props.assetType], '_blank', 'noopener')
}
</script>

<template>
  <section class="open-platform-pane">
    <div class="open-platform-pane__actions">
      <input
        ref="packageInput"
        type="file"
        accept=".zip"
        class="open-platform-pane__file-input"
        :data-testid="`open-platform-${assetType}-file`"
        @change="choosePackage"
      />
      <Button type="text" size="small" class="open-platform-pane__link" @click="openDocs">
        {{ t('routes.devCenterDocs') }}
      </Button>
      <Button
        type="primary"
        size="small"
        :data-testid="`open-platform-create-${assetType}`"
        @click="startCreate"
      >
        <Icon :icon="assetType === 'skill' ? 'lucide:sparkles' : 'lucide:plug'" />
        {{ CREATE_LABELS[assetType] }}
      </Button>
    </div>

    <div class="open-platform-pane__body">
      <p v-if="error" class="open-platform-pane__error">{{ error }}</p>
      <div v-if="items.length === 0 && error" class="open-platform-pane__list-error">
        <Button type="outline" size="small" @click="refresh">
          {{ t('routes.openPlatformRetry') }}
        </Button>
      </div>
      <p v-if="isLoading" class="open-platform-pane__empty">
        {{ t('routes.openPlatformLoading') }}
      </p>

      <div v-else-if="items.length === 0" class="open-platform-pane__empty">
        {{ t('routes.openPlatformEmpty') }}
      </div>

      <div v-else class="open-platform-pane__grid">
        <article v-for="item in items" :key="item.id" class="open-platform-pane__card">
          <div class="open-platform-pane__card-head">
            <div class="open-platform-pane__icon">
              <Icon :icon="assetType === 'skill' ? 'lucide:sparkles' : 'lucide:plug'" />
            </div>
            <div>
              <div class="open-platform-pane__name">{{ item.name }}</div>
              <div class="open-platform-pane__meta">
                <span>{{ item.id }}</span>
              </div>
            </div>
          </div>
          <p class="open-platform-pane__desc">{{ item.description }}</p>
          <footer>
            <div class="open-platform-pane__publish-meta">
              <span class="open-platform-pane__status" :class="`is-${item.status}`">
                {{
                  item.status === 'published'
                    ? t('routes.openPlatformStatusPublished')
                    : item.status === 'unpublished'
                      ? t('routes.openPlatformStatusUnpublished')
                      : '未发布'
                }}
              </span>
              <div class="open-platform-pane__provider-field">
                <span class="open-platform-pane__required-label">
                  <span class="open-platform-pane__required-star">*</span>
                  {{ t('routes.openPlatformPublishOrganization') }}：
                </span>
                <Input
                  v-model="publishProviders[item.id]"
                  class="open-platform-pane__provider-input"
                  :disabled="isPublishing"
                  :data-testid="`open-platform-${assetType}-provider-${item.id}`"
                  :placeholder="t('routes.openPlatformPublishOrganizationPlaceholder')"
                  @click.stop
                />
              </div>
            </div>
            <div class="open-platform-pane__card-actions">
              <ConfirmAction
                v-if="item.status === 'published'"
                :label="UPDATE_LABELS[assetType]"
                :description="`将使用新 zip 包更新「${item.name}」。`"
                confirm-label="确认更新"
                variant="default"
                :disabled="isPublishing || !isPublishProviderReady(item)"
                :test-id="`open-platform-${assetType}-update-${item.id}`"
                :popup-visible="updateTarget?.id === item.id && isUpdateConfirmVisible"
                @update:popup-visible="(visible) => handleUpdateVisible(item, visible)"
                @confirm="submitUpdate(item)"
              />
              <ConfirmAction
                v-if="item.status === 'published'"
                label="下架"
                description="下架后市场将不再展示该内容。"
                confirm-label="确认下架"
                variant="default"
                confirm-variant="destructive"
                :disabled="isPublishing"
                :test-id="`open-platform-${assetType}-unpublish-${item.id}`"
                @confirm="unpublish(item)"
              />
              <ConfirmAction
                v-if="item.status === 'draft'"
                label="发布"
                description="发布后市场将展示该内容。"
                confirm-label="确认发布"
                variant="default"
                :disabled="isPublishing || !isPublishProviderReady(item)"
                :test-id="`open-platform-${assetType}-publish-${item.id}`"
                @confirm="publishDraft(item)"
              />
              <ConfirmAction
                v-if="item.status === 'unpublished'"
                label="重新发布"
                description="重新发布后市场将恢复展示该内容。"
                confirm-label="确认发布"
                variant="default"
                :disabled="isPublishing || !isPublishProviderReady(item)"
                :test-id="`open-platform-${assetType}-republish-${item.id}`"
                @confirm="republish(item)"
              />
              <ConfirmAction
                v-if="item.status === 'draft' || item.status === 'unpublished'"
                label="移除"
                description="移除后当前列表将不再展示该内容。"
                confirm-label="确认移除"
                variant="outline"
                confirm-variant="destructive"
                :disabled="isPublishing"
                :test-id="`open-platform-${assetType}-remove-${item.id}`"
                @confirm="remove(item)"
              />
            </div>
          </footer>
        </article>
      </div>
    </div>
  </section>
</template>
